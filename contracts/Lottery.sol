// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

interface IUSDT {
    function transferFrom(address _from, address _to, uint _value) external;
    function allowance(address _owner, address _spender) external returns (uint remaining);
}

interface ITicketNFT {
    function safeMint(address _user) external;
    function balanceOf(address _owner) external view returns (uint256);
    function ownerOf(uint256 tokenId) external returns (address);
}

contract Lottery is Ownable {

    /**
    * @notice Struct - UserInfo
    * @param numberOfWonCyclesInRow Count of won cycles in a row.
    * @param lastWonCycle Number of last won cycle.
    * @param soldTicketsCount Count of bought tickets by his referrals.
    * @param ticketsArr Array of user's bought tickets.
    * @param referralsCount Count of invited users aka Referrals.
    * @param addressId ID of the user.
    */
    struct UserInfo{
        uint256 numberOfWonCyclesInRow;
        uint256 lastWonCycle;
        uint256 soldTicketsCount; 
        uint256[] ticketsArr; 
        uint256 referralsCount; 
        uint256 addressId; 
    }

    uint256 public numberOfTickets;
    uint256 public numberOfSoldTickets;
    uint256 public ticketPrice; // set in wei
    uint256 public usersCount;
    uint256 public winningTicketsCount;
    uint256 public cycleCount;
    uint256 public monthlyJackpotStartTimestamp;
    uint256 public amountFromCycleToMonthlyJackpot; // set in wei
    address public tetherAddress;
    address public bankAddress;
    address public monthlyJackpotAddress;
    address public ticketNFTAddress;
    address public lastMonthlyJackpotWinner;
    // All winning amounts are in USDT
    uint256 public monthlyJackpotWinningAmount; // set in wei
    // 0 index is jackpotWinningAmount, 1 - top16Winners, 2 - top62Winners, 3 - top125Winners;
    uint256[4] public winningAmounts; // set in wei
    // Bonus functionality variables
    // 0 index is bonusForReferrals, 1 - bonusForSoldTickets, 2 - bonusForWinningInRow, 3 - bonusForBoughtTickets
    // 4 - refferalsCountForBonus, 5 - soldTicketsCountForBonus, 6 - winningInRowCountForBonus, 7 - boughtTicketCountForBonus;
    uint256[8] public bonusParameters; 
    // 0 index is the percentage of 1st parent, 1 - 2rd parent, 2 - 3rd parent 
    uint256[3] public parentsPercentages;
    // 0 index is jackpot winners count, 1 - second reward winners Count, 2 - third reward winners Count, 3 - fourth reward winners Count;
    uint256[4] public winningTicketsCountByLevels;
    // boolean for checking new cycle activness
    bool public isCycleActive;

    mapping(uint256 => address) public ticketNumberToAddress;
    mapping(address => address) public addressToHisReferrer; // Referrer is higher in the tree
    mapping(uint256 => address) public idToHisAddress; // ID is for referral system, user can invite other users by his id
    mapping(uint256 => bool) ticketUniqueness;
    mapping(address => UserInfo) userInfo;
    mapping(address => bool) public isAdmin;
    uint256[] public winningTickets;

    //events
    event TicketBought(address indexed buyer, uint256 indexed count);
    event NewCycleStarted(address indexed caller, uint256 cycleCount, uint time);
    event WinnersRewarded(address indexed caller);
    event MonthlyJackpotExecuted(address indexed winner, uint256 indexed newJackpotStartingTime);

    receive() external payable {}

    fallback() external payable {}

    /**
    * @notice Modifier - activeCycle
    * @dev Ensures that the current lottery cycle is active before allowing function execution.
    * @dev Apply this modifier to functions in the Lottery contract that require an active cycle.
    */
    modifier activeCycle(){
        require(isCycleActive, "Lottery: Currently you can not buy new tickets");
        _;
    }

    modifier OnlyAdmin(){
        require(isAdmin[msg.sender], "Lottery: This function can be called only by admins");
        _;
    }
    
    constructor() Ownable(msg.sender) {
        idToHisAddress[0] = owner();
        usersCount = 1;
        monthlyJackpotStartTimestamp = block.timestamp;
    }

    /**
    * @notice Allows users to purchase a specified number of tickets for the ongoing lottery cycle.
    * @dev Requires an active lottery cycle as enforced by the activeCycle modifier.
    * @param _countOfTickets The number of tickets to be purchased by the user.
    * @param _refId The reference ID associated with the user's ticket purchase.
    * @dev Call this function to buy tickets during an active lottery cycle.
    */
    function buyTickets(uint256 _countOfTickets, uint256 _refId) external activeCycle{
        require(_countOfTickets > 0, "Lottery: Count of tickets can not be 0");
        require(IUSDT(tetherAddress).allowance(msg.sender, address(this)) >= ticketPrice * _countOfTickets, "Lottery: User has not given enough allowance"); //Checking Allowance in USDT Contract
        require((numberOfSoldTickets + _countOfTickets) <=  numberOfTickets * cycleCount, "Lottery: tickets count + sold tickets count must be smaller than number of available tickets");
        require(!(addressToHisReferrer[msg.sender] != address(0) && idToHisAddress[_refId] != addressToHisReferrer[msg.sender]),"Lottery: your referrer is already set and it is another user"); //checking refid
        require(_refId < usersCount, "Lottery: Incorrect ID!");
        uint256 totalAmount = ticketPrice * _countOfTickets;

        IUSDT(tetherAddress).transferFrom(msg.sender, bankAddress, totalAmount);

        if(userInfo[msg.sender].ticketsArr.length == 0){
            userInfo[msg.sender].addressId = usersCount;
            idToHisAddress[usersCount] = msg.sender;
            ++usersCount;
        }

        if(addressToHisReferrer[msg.sender] == address(0)){
            address referrer = idToHisAddress[_refId];
            addressToHisReferrer[msg.sender] = referrer;
            ++userInfo[referrer].referralsCount;
            if(addressToHisReferrer[msg.sender] != owner())
                referralCountBonus(referrer);
        }

        uint256 boughtTicketsCountBefore = userInfo[msg.sender].ticketsArr.length;
        for(uint256 i = 1; i <= _countOfTickets; ++i){
            ++numberOfSoldTickets;
            userInfo[msg.sender].ticketsArr.push(numberOfSoldTickets);
            ITicketNFT(ticketNFTAddress).safeMint(msg.sender);
            ticketNumberToAddress[numberOfSoldTickets] = msg.sender; 
        }

        //logic of rewarding referrer
        uint256 soldTicketsCountBefore = userInfo[addressToHisReferrer[msg.sender]].soldTicketsCount;
        if(addressToHisReferrer[msg.sender] != owner()){
            userInfo[addressToHisReferrer[msg.sender]].soldTicketsCount += _countOfTickets;
            if(userInfo[addressToHisReferrer[msg.sender]].soldTicketsCount >= 5){
                IUSDT(tetherAddress).transferFrom(bankAddress, addressToHisReferrer[msg.sender], totalAmount / 10); 
            } else {
                IUSDT(tetherAddress).transferFrom(bankAddress, addressToHisReferrer[msg.sender], totalAmount / 20);
            }
        }

        boughtTicketsCountBonus(msg.sender, boughtTicketsCountBefore);

        if(addressToHisReferrer[msg.sender] != owner())
            soldTicketsCountBonus(addressToHisReferrer[msg.sender], soldTicketsCountBefore);

        if(numberOfSoldTickets % numberOfTickets == 0){
            isCycleActive = false;
            monthlyJackpotWinningAmount += amountFromCycleToMonthlyJackpot;
            IUSDT(tetherAddress).transferFrom(bankAddress, monthlyJackpotAddress, amountFromCycleToMonthlyJackpot);
        }

        emit TicketBought(msg.sender, _countOfTickets);
    }

    /**
    * @notice Function - setTicketsNumber
    * @dev Sets the number of tickets for the lottery cycle.
    * @param _numberOfTickets The new number of tickets to be set.
    * @dev Only the contract owner can execute this function.
    */
    function setTicketsNumber(uint256 _numberOfTickets) external onlyOwner{
        numberOfTickets = _numberOfTickets;
    }

    /**
    * @notice Function - setTicketPrice
    * @dev Sets the price of the ticket for the lottery cycle.
    * @param _ticketPrice The new price of tickets to be set.
    * @dev Only the contract owner can execute this function.
    */
    function setTicketPrice(uint256 _ticketPrice) external onlyOwner{
        ticketPrice = _ticketPrice;
    }

    /**
    * @notice Function - setBankAddress
    * @dev Sets the address of the Bank.
    * @param _bank The new address of the Bank.
    * @dev Only the contract owner can execute this function.
    */
    function setBankAddress(address _bank) external onlyOwner{
        bankAddress = _bank;
    }

    /**
    * @notice Function - setMonthlyJackpotAddress
    * @dev Sets the address of the Jackpot.
    * @param _jackpot The new address of the Bank.
    * @dev Only the contract owner can execute this function.
    */
    function setMonthlyJackpotAddress(address _jackpot) external onlyOwner{
        monthlyJackpotAddress = _jackpot;
    }

    /**
    * @notice Function - setTicketNFTAddress
    * @dev Sets the address of the NFT contract.
    * @param _ticketAddress The new address of the NFT tickets.
    * @dev Only the contract owner can execute this function.
    */
    function setTicketNFTAddress(address _ticketAddress) external onlyOwner{
        ticketNFTAddress = _ticketAddress;
    }

    /**
    * @notice Function - setStableCoinAddress
    * @dev Sets the address of the Stable coin.
    * @param _tokenAddress The new address of the Stable coin.
    * @dev Only the contract owner can execute this function.
    */
    function setStableCoinAddress(address _tokenAddress) external onlyOwner{
        tetherAddress = _tokenAddress;
    }

    /**
    * @notice Function - setWinningAmounts
    * @dev Sets the winning amount in WEI for each type.
    * @param _amounts The new winning amounts.
    * @dev Only the contract owner can execute this function.
    */
    function setWinningAmounts(uint256[4] memory _amounts) external onlyOwner{
        winningAmounts = _amounts;
    }

    /**
    * @notice Function - setAmountFromCycleToMonthlyJackpot
    * @dev Sets the new amount to be executed after finishing cycle to the jackpot address (WEI).
    * @param _amount The new executing amount for cycle.
    * @dev Only the contract owner can execute this function.
    */
    function setAmountFromCycleToMonthlyJackpot(uint256 _amount) external onlyOwner{
        amountFromCycleToMonthlyJackpot = _amount;
    }

    /**
    * @notice Function - setTsetMonthlyWinningAmounticketPrice
    * @dev Sets the new winning amount in WEI.
    * @param _amount The new winning amount for month.
    * @dev Only the contract owner can execute this function.
    */
    function setMonthlyWinningAmount(uint256 _amount) external onlyOwner{
        monthlyJackpotWinningAmount = _amount;
    }

    /**
    * @notice Function - setParentsRewardPercentages
    * @dev Sets the Referrer(Parent) reward percentages for each parent type.
    * @param _percentages The new reward percentages.
    * @dev Only the contract owner can execute this function.
    */
    function setParentsRewardPercentages(uint256[3] memory _percentages) external onlyOwner{
        parentsPercentages = _percentages;
    }

    /**
    * @notice Function - setWinningTicketsCountByLevels
    * @dev Sets the new counts of winning tickets for different levels.
    * @param _winningTicketsCounts The new Winning tickets counts.
    * @dev Only the contract owner can execute this function.
    */
    function setWinningTicketsCountByLevels(uint256[4] memory _winningTicketsCounts) external onlyOwner{
        winningTicketsCountByLevels = _winningTicketsCounts;
        winningTicketsCount = 0;
        for(uint8 i; i < 4; ++i){
            winningTicketsCount += _winningTicketsCounts[i];
        }
    }

    /**
    * @notice Function - setAdminStatus
    * @dev Sets Admin status.
    * @param _admin Address of Admin.
    * @param _status Boolean variable for enabling or disabling Admin.
    * @dev Only the contract owner can execute this function.
    */
    function setAdminStatus(address _admin, bool _status) external onlyOwner{
        isAdmin[_admin] = _status;
    }

    /**
    * @notice Function - setBonusVaraiablesValues
    * @dev Sets the bonus rewards in wei and, conditional counts to get bonuses.
    * @param _bonusParametres The new bonus system parametres.
    * @dev Only the contract owner can execute this function.
    */
    function setBonusVaraiablesValues(uint256[8] memory _bonusParametres) external onlyOwner{
        bonusParameters = _bonusParametres;
    }
    
    /**
    * @notice Function - monthlyJackpotExecuting
    * @dev Executes the monthly Jackot.
    * @dev Only the contract owner can execute this function.
    */
    function monthlyJackpotExecuting() external onlyOwner{
        require(monthlyJackpotStartTimestamp + 30 days <= block.timestamp ,"Lottery: You can call monthlyJackpotExecuting function once in a month!");
        monthlyJackpotStartTimestamp = block.timestamp;
        address winner = idToHisAddress[getRandomNumberForMonthlyJackpot()];
        lastMonthlyJackpotWinner = winner;
        IUSDT(tetherAddress).transferFrom(monthlyJackpotAddress, winner, monthlyJackpotWinningAmount);
        monthlyJackpotWinningAmount = 0;
        emit MonthlyJackpotExecuted(winner, monthlyJackpotStartTimestamp);
    }

    /**
    * @notice Function - startNewCycle
    * @dev Starts new cycle, after deleting old winning tickets and incrementing cycle count.
    * @dev Only the contract owner can execute this function.
    */
    function startNewCycle() external onlyOwner{ 
        require(winningTickets.length > 0 || cycleCount == 0, "Lottery: Can not start new cycle!");
        delete winningTickets;
        isCycleActive = true;
        ++cycleCount;
        emit NewCycleStarted(msg.sender, cycleCount, block.timestamp);
    }

    /**
    * @notice Function - referralCountBonus
    * @dev Checks conditions to send bonus for invited refferals.
    * @param _bonusWinner The Address of expected bonus winner.
    */
    function referralCountBonus(address _bonusWinner) private {
        if(userInfo[_bonusWinner].referralsCount % bonusParameters[4] == 0)
            IUSDT(tetherAddress).transferFrom(bankAddress, _bonusWinner, bonusParameters[0]);
    }

    /**
    * @notice Function - soldTicketsCountBonus
    * @dev Checks conditions to send bonus for sold tickets.
    * @param _bonusWinner The Address of expected bonus winner.
    */
    function soldTicketsCountBonus(address _bonusWinner, uint256 _soldTicketsCountBefore) private {
        uint256 diff = userInfo[_bonusWinner].soldTicketsCount / bonusParameters[5] - _soldTicketsCountBefore / bonusParameters[5];
        if(diff > 0)
            IUSDT(tetherAddress).transferFrom(bankAddress, _bonusWinner, diff * bonusParameters[1]);
    }

    /**
    * @notice Function - boughtTicketsCountBonus
    * @dev Checks conditions to send bonus for bought tickets.
    * @param _bonusWinner The Address of expected bonus winner.
    */
    function boughtTicketsCountBonus(address _bonusWinner, uint256 _boughtTicketsCountBefore) private {
        uint256 diff = userInfo[_bonusWinner].ticketsArr.length / bonusParameters[7] - _boughtTicketsCountBefore / bonusParameters[7];
        if(diff > 0)
            IUSDT(tetherAddress).transferFrom(bankAddress, _bonusWinner, diff * bonusParameters[3]);
    }

    /**
    * @notice Function - winningInRowBonus
    * @dev Checks conditions to send bonus for winning in a Row.
    * @param _bonusWinner The Address of expected bonus winner.
    */
    function winningInRowBonus(address _bonusWinner) private {
        if(userInfo[_bonusWinner].numberOfWonCyclesInRow == bonusParameters[6])
            IUSDT(tetherAddress).transferFrom(bankAddress, _bonusWinner, bonusParameters[2]);
    }

    /**
    * @notice Function - rewardWinners
    * @dev After selling all tickets owner calls this function to distribute rewards.
    * @dev Only the contract owner can execute this function.
    */
    function rewardWinners() external onlyOwner {
        require(isCycleActive == false, "Lottery: You can call rewardWinners function only after quiting cycle");
        getRandomNumbers();
        for(uint256 i; i < winningTicketsCount; ++i) {
            if(i < winningTicketsCountByLevels[0]){
                rewardingReferrers(winningAmounts[0], ticketNumberToAddress[winningTickets[i]]);
            }
            else if(i >= winningTicketsCountByLevels[0] && i < winningTicketsCountByLevels[1] + winningTicketsCountByLevels[0]){
                rewardingReferrers(winningAmounts[1], ticketNumberToAddress[winningTickets[i]]);
            }
            else if(i >= winningTicketsCountByLevels[1] + winningTicketsCountByLevels[0] && i < winningTicketsCountByLevels[2] + winningTicketsCountByLevels[1] + winningTicketsCountByLevels[0]){
                rewardingReferrers(winningAmounts[2], ticketNumberToAddress[winningTickets[i]]);
            }
            else if(i >= winningTicketsCountByLevels[2] + winningTicketsCountByLevels[1] + winningTicketsCountByLevels[0] && i < winningTicketsCount){
                rewardingReferrers(winningAmounts[3], ticketNumberToAddress[winningTickets[i]]);
            }

            if(cycleCount > userInfo[ticketNumberToAddress[winningTickets[i]]].lastWonCycle){
                if(cycleCount - userInfo[ticketNumberToAddress[winningTickets[i]]].lastWonCycle == 1) {
                    userInfo[ticketNumberToAddress[winningTickets[i]]].numberOfWonCyclesInRow++;
                    if(userInfo[ticketNumberToAddress[winningTickets[i]]].numberOfWonCyclesInRow == bonusParameters[6]){
                        winningInRowBonus(ticketNumberToAddress[winningTickets[i]]);
                        userInfo[ticketNumberToAddress[winningTickets[i]]].numberOfWonCyclesInRow = 0;
                    }
                }
                else {
                    userInfo[ticketNumberToAddress[winningTickets[i]]].numberOfWonCyclesInRow = 1;
                }
                userInfo[ticketNumberToAddress[winningTickets[i]]].lastWonCycle = cycleCount;
            }   
        }
        emit WinnersRewarded(msg.sender);
    }

    /**
    * @notice Function - rewardingReferrers
    * @dev Checking if winner is in MLM structure, and after it distribute rewards to his referrers.
    * @param _winningAmount Reward of winner.
    * @param _winnerAddress The Address of winner.
    * @dev Only the contract owner can execute this function.
    */
    function rewardingReferrers(uint256 _winningAmount, address _winnerAddress) private {
        address temp = addressToHisReferrer[_winnerAddress]; 
        for(uint8 j; j < 3; ++j) {
            if(temp == owner())
                break;
            IUSDT(tetherAddress).transferFrom(bankAddress, temp, (_winningAmount * parentsPercentages[j]) / 100);
            temp = addressToHisReferrer[temp];
        }
        IUSDT(tetherAddress).transferFrom(bankAddress, _winnerAddress, _winningAmount); 
    }

    /**
    * @notice Function - getRandomNumbers
    * @dev Generating random numbers on chain for getting winning tickets (777 lottery).
    */
    function getRandomNumbers() private {
        uint16 i;
        uint256 ticketNumber;
        while(winningTickets.length < winningTicketsCount){
            ++i;
            ticketNumber = (cycleCount - 1) * numberOfTickets + uint256(keccak256(abi.encodePacked(block.timestamp+i,block.number, msg.sender))) % numberOfTickets + 1;
            if(!(ticketUniqueness[ticketNumber])){
                ticketUniqueness[ticketNumber] = true;
                winningTickets.push(ticketNumber);
            }
        }
    }

    /**
    * @notice Function - getRandomNumberForMonthlyJackpot
    * @dev Generating only one random number on chain for getting winner of monthly jackpot.
    */
    function getRandomNumberForMonthlyJackpot() private view returns(uint256){
        return uint256(keccak256(abi.encodePacked(block.timestamp,block.number, owner()))) % (usersCount - 1) + 1;
    }
    
    /**
    * @notice Function - getUserInfo
    * @param _user Address of User.
    * @dev Returns information about user.
    */
    function getUserInfo(address _user) external view OnlyAdmin returns(UserInfo memory) {
        return userInfo[_user];
    }
}