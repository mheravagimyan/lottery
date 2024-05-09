// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Ticket is ERC721, Ownable {
    uint private _tokenIdCounter; // Counter to identify the current TokenID 

    /**
    * @dev Paramaters provided for deployment
    */  
    address public mlmLotteryAddress;
    bool public transferStatus;
   /**
    * @dev Constructor
    */
    constructor(string memory _ticketName, string memory _ticketSymbol) ERC721(_ticketName, _ticketSymbol) Ownable(msg.sender) {}

/* MODIFIERS */

    /**
    * @dev Checks if caller is MLM smart contract
    */
    modifier onlyMlmLottery(){
        require(msg.sender == mlmLotteryAddress, "Ticket:: Only MLM Lottery smart contract can call this function");
        _;
    }

    modifier isTransferActive(){
        require(transferStatus == true, "Ticket:: Transfers are deactivated currently");
        _;
    }

/* FUNCTIONS */

    function setMlmLotteryAddress(address _mlmLottery) external onlyOwner{
        mlmLotteryAddress = _mlmLottery;
    }

    function setTransferStatus(bool _status) external onlyOwner{
        transferStatus = _status;
    }

    /**
    * @dev Minting a new Ticket
    */
    function safeMint(address to) external onlyMlmLottery{
        // Require the amount of tickets wanting to be purchased does not exceed venue size
        //require(_amount <= (venueSize - _tokenIdCounter.current()), "Not enough avaliable tickets");

        // For the amount of tickets purchased
         
        _safeMint(to, ++_tokenIdCounter); // Mint ticket at current tokenId
    }

    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenId,
        bytes memory data
    ) public virtual override isTransferActive{
        super.safeTransferFrom(from,to,tokenId, data);
    }

    function transferFrom(
        address from,
        address to,
        uint256 tokenId
    ) public virtual override isTransferActive{
        super.transferFrom(from, to, tokenId);
    }

}