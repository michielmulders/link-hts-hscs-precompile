// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.11;
pragma experimental ABIEncoderV2;

import "./hip-206/HederaTokenService.sol";
import "./hip-206/HederaResponseCodes.sol";

contract myContract is HederaTokenService {

    address tokenAddress;

    constructor(address _tokenAddress) {
        tokenAddress = _tokenAddress;
    }

    function mintNft(uint64 _amount, bytes[] memory _metadata) external returns(int64) {
        // better to remove unused vars to optimize gas
        // (int response, uint64 newTotalSupply, int64[] memory serialNumbers) = HederaTokenService.mintToken(tokenAddress, _amount, new bytes[](0));
        //(int response, , ) = HederaTokenService.mintToken(tokenAddress, _amount, _metadata);
        (int response, , int64[] memory serialNumbers) = HederaTokenService.mintToken(tokenAddress, _amount, _metadata);

        if (response != HederaResponseCodes.SUCCESS) {
            revert ("Mint Failed");
        }

        return serialNumbers[0];
    }

    function tokenAssociate(address _account) external {
        int response = HederaTokenService.associateToken(_account, tokenAddress);

        if (response != HederaResponseCodes.SUCCESS) {
            revert ("Associate Failed");
        }
    }

    function transferNFT(address _sender, address _receiver, int64 _serialNumber) external {
        int response = HederaTokenService.transferNFT(tokenAddress, _sender, _receiver, _serialNumber);

        if (response != HederaResponseCodes.SUCCESS) {
            revert ("NFT Transfer Failed");
        }
    }

}

