import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

const keypair = Keypair.generate();
const secretKey = bs58.encode(keypair.secretKey);
const publicKey = keypair.publicKey.toBase58();

console.log('=== Treasury Keypair Generated ===');
console.log('');
console.log('Public Key (address):', publicKey);
console.log('');
console.log('Private Key (base58, for .env):');
console.log(secretKey);
console.log('');
console.log('Add to your .env file:');
console.log(`TREASURY_PRIVATE_KEY=${secretKey}`);
console.log('');
console.log('Fund on devnet:');
console.log(`solana airdrop 5 ${publicKey} --url devnet`);
