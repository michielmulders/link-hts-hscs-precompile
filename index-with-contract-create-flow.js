console.clear();
require("dotenv").config();
const {
  Client,
  AccountId,
  PrivateKey,
  TokenCreateTransaction,
  ContractFunctionParameters,
  TokenUpdateTransaction,
  ContractExecuteTransaction,
  TokenType,
  TokenInfoQuery,
  AccountBalanceQuery,
  TokenSupplyType,
  Hbar,
  ContractCreateFlow,
  TokenAssociateTransaction
} = require("@hashgraph/sdk");
const fs = require("fs");
const path = require("path");
const axios = require("axios").default;

const operatorId = AccountId.fromString(process.env.OPERATOR_ID);
const operatorKey = PrivateKey.fromString(process.env.OPERATOR_PVKEY);
const treasuryId = AccountId.fromString(process.env.TREASURY_ID);
const treasuryKey = PrivateKey.fromString(process.env.TREASURY_PVKEY);
const aliceId = AccountId.fromString(process.env.ALICE_ID);
const aliceyKey = PrivateKey.fromString(process.env.ALICE_PVKEY);

const client = Client.forTestnet().setOperator(operatorId, operatorKey);

// Initial supply: 100 -> we later mint 150 new tokens (total supply 250)
// Token info and balances: https://hashscan.io/#/testnet/token/0.0.47879139
// Smart contract doesn't show data: https://hashscan.io/#/testnet/contract/0.0.47879141
// Token update transaction: https://hashscan.io/#/testnet/transaction/0.0.47741098-1660255276-237317694?t=1660255285.465998154
// |-> (shows up at operator account because this account pays - the treasury signs but that doesn't mean it will show up at treasury account transaction logs)
async function main() {
  // STEP 1 ===================================
  console.log(`STEP 1 ===================================`);
  const bytecode = fs.readFileSync(
    path.resolve(__dirname, "NftMintAssociateTransferHTS.bin")
  );
  console.log(`- Done \n`);

  // STEP 2 ===================================
  console.log(`STEP 2 ===================================`);
  //Create a fungible token
  const tokenCreateTx = await new TokenCreateTransaction()
    .setTokenName("gorillat")
    .setTokenSymbol("GLT")
    .setTokenType(TokenType.NonFungibleUnique)
    .setDecimals(0)
    .setInitialSupply(0)
    .setTreasuryAccountId(treasuryId)
    .setAdminKey(treasuryKey)
    .setSupplyKey(treasuryKey)
    .setSupplyType(TokenSupplyType.Finite)
    .setMaxSupply(1)
    .freezeWith(client)
    .sign(treasuryKey);

  const tokenCreateSubmit = await tokenCreateTx.execute(client);
  const tokenCreateRx = await tokenCreateSubmit.getReceipt(client);
  const tokenId = tokenCreateRx.tokenId;
  const tokenAddressSol = tokenId.toSolidityAddress();
  console.log(`- Token ID: ${tokenId}`);
  console.log(`- Token ID in Solidity format: ${tokenAddressSol}`);

  // Token query 1
  const tokenInfo1 = await tQueryFcn(tokenId);
  console.log(`- Initial token supply: ${tokenInfo1.totalSupply.low} \n`);

  // STEP 3 ===================================
  console.log(`STEP 3 ===================================`);
  const contractCreate = new ContractCreateFlow()
    .setGas(3000000)
    .setBytecode(bytecode)
    .setConstructorParameters(
        new ContractFunctionParameters().addAddress(tokenAddressSol)
    );

  const contractCreateSubmit = await contractCreate.execute(client);
  const contractCreateRx = await contractCreateSubmit.getReceipt(
    client
  );
  const contractId = contractCreateRx.contractId;
  const contractAddress = contractId.toSolidityAddress();
  console.log(`- The smart contract ID is: ${contractId}`);
  console.log(
    `- The smart contract ID in Solidity format is: ${contractAddress} \n`
  );

  // Token query 2.1
  const tokenInfo2p1 = await tQueryFcn(tokenId);
  console.log(`- Token supply key: ${tokenInfo2p1.supplyKey.toString()}`);

  // IMPORTANT: Update the fungible token so the smart contract manages the supply
  const tokenUpdateTx = await new TokenUpdateTransaction()
    .setTokenId(tokenId)
    .setSupplyKey(contractId) // smart contract ID replaces the old supply key to manage the supply (mint burn transfer)
    .freezeWith(client)
    .sign(treasuryKey); // treasury key is admin key who can update the token properties
  const tokenUpdateSubmit = await tokenUpdateTx.execute(client);
  const tokenUpdateRx = await tokenUpdateSubmit.getReceipt(client);
  console.log(`- Token update status: ${tokenUpdateRx.status}`);
  console.log(`- Token update transaction ID: ${tokenUpdateSubmit.transactionId}`)

  // Token query 2.2
  const tokenInfo2p2 = await tQueryFcn(tokenId);
  console.log(
    `- New token supply key: ${tokenInfo2p2.supplyKey.toString()} \n`
  );

  // STEP 4 ===================================
  console.log(`STEP 4 ===================================`);
  //Execute a contract function (mint)
  const CID = "ipfs://bafyreie3ichmqul4xa7e6xcy34tylbuq2vf3gnjf7c55trg3b6xyjr4bku/metadata.json";
  const contractExecTx = await new ContractExecuteTransaction()
    .setContractId(contractId)
    .setGas(3000000)
    .setFunction(
      "mintNft", // Call correct function name
      new ContractFunctionParameters().addUint64(0).addBytesArray([Buffer.from(CID)]) // Mint 1 NFT
    );
  const contractExecSubmit = await contractExecTx.execute(client);
  const contractExecRx = await contractExecSubmit.getRecord(client);
  console.log(`- New tokens minted: ${contractExecRx.receipt.status}`);
  console.log(contractExecRx); // check if the below is included
  console.log(`\n\nSerial: ${contractExecRx.contractFunctionResult.getInt64(0)}`);


  // Token query 3
  const tokenInfo3 = await tQueryFcn(tokenId);
  console.log(`- New token supply: ${tokenInfo3.totalSupply.low} \n`);

  //Execute a contract function (associate)
  const contractExecTx1 = await new ContractExecuteTransaction()
    .setContractId(contractId)
    .setGas(3000000)
    .setFunction(
      "tokenAssociate",
      new ContractFunctionParameters().addAddress(aliceId.toSolidityAddress())
    )
    .freezeWith(client);
  const contractExecSign1 = await contractExecTx1.sign(aliceyKey);
  const contractExecSubmit1 = await contractExecSign1.execute(client);
  const contractExecRx1 = await contractExecSubmit1.getReceipt(client);
  console.log(
    `- Token association with Alice's account: ${contractExecRx1.status.toString()} \n`
  );

  //Execute a contract function (transfer)
  const contractExecTx2 = await new ContractExecuteTransaction()
    .setContractId(contractId)
    .setGas(3000000)
    .setFunction(
      "transferNFT",
      new ContractFunctionParameters()
        .addAddress(treasuryId.toSolidityAddress())
        .addAddress(aliceId.toSolidityAddress())
        .addInt64(1) // mintRx.serials[0]
    )
    .freezeWith(client);
  const contractExecSign2 = await contractExecTx2.sign(treasuryKey);
  const contractExecSubmit2 = await contractExecSign2.execute(client);
  const contractExecRx2 = await contractExecSubmit2.getReceipt(client);

  console.log(
    `- Token transfer from Treasury to Alice: ${contractExecRx2.status.toString()}`
  );

  const tB = await bCheckerFcn(treasuryId);
  const aB = await bCheckerFcn(aliceId);
  console.log(`- Treasury balance: ${tB} units of token: ${tokenId}`);
  console.log(`- Alice balance: ${aB} units of token: ${tokenId} \n`);


  client.close();
  
  // ========================================
  // FUNCTIONS

  async function tQueryFcn(tId) {
    let info = await new TokenInfoQuery().setTokenId(tId).execute(client);
    return info;
  }

  async function bCheckerFcn(aId) {
    let balanceCheckTx = await new AccountBalanceQuery()
      .setAccountId(aId)
      .execute(client);
    return balanceCheckTx.tokens._map.get(tokenId.toString()); // deprecated -> use mirror node API
  }
}
main();
