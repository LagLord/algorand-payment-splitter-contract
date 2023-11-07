import algosdk from 'algosdk';
import deploy from './deploy';

const genWallet = () => {
    const generatedAccount = algosdk.generateAccount();
    const passphrase = algosdk.secretKeyToMnemonic(generatedAccount.sk);
    console.log(`My address: ${generatedAccount.addr}`);
    console.log(`My passphrase: ${passphrase}`);
    return [generatedAccount.addr, passphrase]
}
const main = async () => {
    const [acc1, seed1] = genWallet();
    const [acc2, seed2] = genWallet();
    const [acc3, seed3] = genWallet();
    const appAddress = await deploy();
    console.log('Deployed the contract successfully!')
}

main();