/* eslint-disable no-console */
import algosdk from 'algosdk';
import readline from 'readline';
import process from 'process';
import fs from 'fs';
import abi from '../artifacts/contract.json';


/* Run this for deploying the contract on Algorand Testnet could be tested here https://app.dappflow.org/ once deployed*/
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const skipPrompts = process.argv.includes('--skip-prompts');

function waitForInput() {
    if (skipPrompts === true) return new Promise((resolve) => { resolve(true); });
    return new Promise((resolve) => {
        rl.question('Press enter to continue...', resolve);
    });
}

async function main() {
    // Account creation
    const accounts = []
    let account: algosdk.Account;

    for (let i = 0; i < 3; i++) {
        account = algosdk.generateAccount();
        accounts.push(account.addr);
        console.log(`Mnemonic${i + 1}:`, algosdk.secretKeyToMnemonic(account.sk));
        console.log(`Address${i + 1}:`, account.addr);
    }

    await waitForInput();

    // Create connection to network via public algod API
    const algodToken = '';
    const algodServer = 'https://testnet-api.algonode.cloud';
    const algodPort = undefined;
    const algodClient = new algosdk.Algodv2(algodToken, algodServer, algodPort);

    // get accountInfo
    let accountInfo = await algodClient.accountInformation(account.addr).do();

    console.log('accountInfo:', accountInfo);

    await waitForInput();

    console.log(`Dispsene ALGO to ${account.addr} at https://testnet.algoexplorer.io/dispenser. Script will continue once ALGO is received...`);

    // Check balance of account via algod
    const waitForBalance = async () => {
        accountInfo = await algodClient.accountInformation(account.addr).do();

        const balance = accountInfo.amount;

        if (balance === 0) {
            await waitForBalance();
        }
    };

    await waitForBalance();

    console.log(`${account.addr} funded!`);

    await waitForInput();

    // Get basic information needed for every transcation
    const suggestedParams = await algodClient.getTransactionParams().do();
    console.log('suggestedParams:', suggestedParams);

    await waitForInput();

    // create app
    const approvalSource = fs.readFileSync('../artifacts/approval.teal', 'utf8');
    const clearSource = fs.readFileSync('../artifacts/clear.teal', 'utf8');

    // Compile the TEAL programs
    const approvalCompileResult = await algodClient.compile(approvalSource).do();
    const clearCompileResult = await algodClient.compile(clearSource).do();

    // Convert the compilation result to Uint8Array
    const approvalBytes = new Uint8Array(Buffer.from(approvalCompileResult.result, 'base64'));
    const clearBytes = new Uint8Array(Buffer.from(clearCompileResult.result, 'base64'));

    // Read our ABI JSON file to create an ABIContract object
    const contract = new algosdk.ABIContract(abi);

    // Get the selector for the create method
    const createMethodSelector = algosdk.getMethodByName(contract.methods, 'fund').getSelector();

    const appCreateTxn = algosdk.makeApplicationCreateTxnFromObject({
        suggestedParams,
        onComplete: algosdk.OnApplicationComplete.NoOpOC, // Action to take after the appcall passes
        from: account.addr,
        approvalProgram: approvalBytes, // TEAL program to run on app calls and creation
        clearProgram: clearBytes, // TEAL program to run when local account state is deleted
        numGlobalByteSlices: 1, // Number of byteslices stored in global state
        numGlobalInts: 0, // Number of integers stored in global state
        numLocalByteSlices: 0, // Number of byteslices stored in local state
        numLocalInts: 0, // Number of integers stored in local state
        // appArgs: [
        //     createMethodSelector, // First argument is always the selector of the method we're calling
        //     (new algosdk.ABIStringType()).encode('Admin') // Following arguments are the arguments to the method
        // ],
    });

    const signedAppCreateTxn = appCreateTxn.signTxn(account.sk);
    await algodClient.sendRawTransaction(signedAppCreateTxn).do();

    console.log(`Sending transaction ${appCreateTxn.txID()}...`);
    await algosdk.waitForConfirmation(algodClient, appCreateTxn.txID(), 3);

    const appCreateInfo = await algodClient
        .pendingTransactionInformation(appCreateTxn.txID()).do();

    const appIndex = appCreateInfo['application-index'];

    console.log(`App ${appIndex} created! See the transaction at https://testnet.algoexplorer.io/tx/${appCreateTxn.txID()}`);

    await waitForInput();

    const paymentTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        suggestedParams,
        from: account.addr,
        to: algosdk.getApplicationAddress(appIndex),
        amount: 5 * 1e6, // * 1e6 to convert from ALGO to microALGO
    });
    const atc = new algosdk.AtomicTransactionComposer()
    const signer = async (txns: algosdk.Transaction[]) => {
        const arr = txns.map((txn) => txn.signTxn(account.sk))
        return arr
    };

    atc.addMethodCall(
        {
            appID: appIndex,
            method: algosdk.getMethodByName(contract.methods, 'fund'),
            methodArgs: [{ txn: paymentTxn, signer, },
            new algosdk.ABIAddressType().encode(accounts[0]), // Following arguments are the arguments to the method
            new algosdk.ABIAddressType().encode(accounts[1]),
            new algosdk.ABIAddressType().encode(accounts[2]),
                20,
                20,
                60],
            signer,
            sender: account.addr,
            suggestedParams
        }
    )

    const res = await atc.execute(algodClient, 3)
    console.log(`Txn created! See the transaction at https://testnet.algoexplorer.io/tx/${res.methodResults[0].txID}`);

    // const signedPayTxn = paymentTxn.signTxn(account.sk);
    // const appFundTxn = algosdk.makeApplicationNoOpTxnFromObject({
    //     appIndex: appIndex,
    //     suggestedParams,
    //     // amount: 5*(10**6),
    //     // onComplete: algosdk.OnApplicationComplete.NoOpOC, // Action to take after the appcall passes
    //     from: account.addr,
    //     // approvalProgram: approvalBytes, // TEAL program to run on app calls and creation
    //     // clearProgram: clearBytes, // TEAL program to run when local account state is deleted
    //     // numGlobalByteSlices: 1, // Number of byteslices stored in global state
    //     // numGlobalInts: 0, // Number of integers stored in global state
    //     // numLocalByteSlices: 0, // Number of byteslices stored in local state
    //     // numLocalInts: 0, // Number of integers stored in local state
    //     appArgs: [
    //         // createMethodSelector, // First argument is always the selector of the method we're calling

    //         signedPayTxn,
    //         new algosdk.ABIAddressType().encode(accounts[0]), // Following arguments are the arguments to the method
    //         new algosdk.ABIAddressType().encode(accounts[1]),
    //         new algosdk.ABIAddressType().encode(accounts[2]),
    //         new algosdk.ABIUintType(64).encode(20),
    //         new algosdk.ABIUintType(64).encode(20),
    //         new algosdk.ABIUintType(64).encode(60)

    //     ],
    // });
    // console.log(createMethodSelector.length, signedPayTxn.length, new algosdk.ABIAddressType().encode(accounts[0]).length, new algosdk.ABIAddressType().encode(accounts[1]).length,
    //     new algosdk.ABIAddressType().encode(accounts[2]).length, new algosdk.ABIUintType(64).encode(20).length,
    //     new algosdk.ABIUintType(64).encode(20).length,
    //     new algosdk.ABIUintType(64).encode(60).length, appIndex, algosdk.getApplicationAddress(appIndex))

    // const signedAppFundTxn = appFundTxn.signTxn(account.sk);
    // await algodClient.sendRawTransaction(signedAppFundTxn).do();

    // console.log(`Sending transaction ${appFundTxn.txID()}...`);
    // await algosdk.waitForConfirmation(algodClient, appFundTxn.txID(), 3);

    // const appFundInfo = await algodClient
    //     .pendingTransactionInformation(appFundTxn.txID()).do();

}

main().then(() => rl.close());