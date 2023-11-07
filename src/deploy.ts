import fs from 'fs';
import path from 'path';
import { Buffer } from 'buffer';
import { getLocalAlgodClient, getLocalAccounts, compileProgram } from './utils';
import algosdk from 'algosdk';

async function main() {
  /* Execute this for deploying the smart contract on either Localhost(Uncomment the correct section) or Mainnet*/
  /* Note: localhost would need various setup for algokit using docker, etc. https://github.com/algorand/sandbox */

  // Localhost
  // const algodClient = getLocalAlgodClient();
  // const accounts = await getLocalAccounts();
  // const creator = accounts[0];
  // Localhost

  // Mainnet
  const baseServer = "https://mainnet-algorand.api.purestake.io/ps2"
  const port = '';
  const token = {
    'X-API-Key': 'P33HEYbOdf62R9iWuK4wr9Aw5IYvCDkR4qZEA0Fk'
  }

  const algodClient = new algosdk.Algodv2(token, baseServer, port);

  const addr = ""
  const seed = ""
  const creator = {
    addr, privateKey: algosdk.mnemonicToSecretKey(seed).sk
  }
  // Mainnet

  // Load default params
  const suggestedParams = await algodClient.getTransactionParams().do();

  // example: APP_SOURCE
  // define TEAL source from string or from a file
  const approvalProgram = fs.readFileSync(
    path.join(__dirname, '../artifacts/approval.teal'),
    'utf8'
  );
  const clearProgram = fs.readFileSync(
    path.join(__dirname, '../artifacts/clear.teal'),
    'utf8'
  );
  // example: APP_SOURCE

  // example: APP_COMPILE
  const approvalCompileResp = await algodClient
    .compile(Buffer.from(approvalProgram))
    .do();

  const compiledApprovalProgram = new Uint8Array(
    Buffer.from(approvalCompileResp.result, 'base64')
  );

  const clearCompileResp = await algodClient
    .compile(Buffer.from(clearProgram))
    .do();

  const compiledClearProgram = new Uint8Array(
    Buffer.from(clearCompileResp.result, 'base64')
  );
  // example: APP_COMPILE

  // example: APP_SCHEMA
  // define uint64s and byteslices stored in global/local storage
  const numGlobalByteSlices = 1;
  const numGlobalInts = 0;
  const numLocalByteSlices = 0;
  const numLocalInts = 0;
  // example: APP_SCHEMA

  // example: APP_CREATE
  const appCreateTxn = algosdk.makeApplicationCreateTxnFromObject({
    from: creator.addr,
    approvalProgram: compiledApprovalProgram,
    clearProgram: compiledClearProgram,
    numGlobalByteSlices,
    numGlobalInts,
    numLocalByteSlices,
    numLocalInts,
    suggestedParams,
    onComplete: algosdk.OnApplicationComplete.NoOpOC,
  });

  // Sign and send
  await algodClient
    .sendRawTransaction(appCreateTxn.signTxn(creator.privateKey))
    .do();
  const result = await algosdk.waitForConfirmation(
    algodClient,
    appCreateTxn.txID().toString(),
    3
  );
  // Grab app id from confirmed transaction result
  const appId = result['application-index'];
  console.log(`Created app with index: ${appId}\nContract Address: ${algosdk.getApplicationAddress(appId)}`);
  return algosdk.getApplicationAddress(appId);
}

export default main;
// main();