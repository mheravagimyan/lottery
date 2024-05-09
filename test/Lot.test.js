const { ethers } = require("hardhat");
const { expect } = require("chai");
const { time } = require('@nomicfoundation/hardhat-network-helpers');

describe("Lottery", function () {
    let lottery;
    let ticket;
    let token;
    let lotteryAddress;
    let tokenAddress;
    let ticketAddress;
    let ticketPrice;
    let owner, bank, jackpot, user1, user2, user3, user4, user5;

    async function setAll() {
        //Set all ticket setters
        await ticket.setMlmLotteryAddress(lotteryAddress);
        await ticket.setTransferStatus(true);

        //Set all lottery setters
        await lottery.setTicketsNumber(777);
        await lottery.setTicketPrice(ethers.parseEther("100"));
        await lottery.setBankAddress(bank.address);
        await lottery.setTicketNFTAddress(ticketAddress);
        await lottery.setStableCoinAddress(tokenAddress);
        await lottery.setWinningAmounts([ethers.parseEther("750"), ethers.parseEther("500"), ethers.parseEther("400"), ethers.parseEther("300")]);
        await lottery.setParentsRewardPercentages([15, 10, 5]);
        await lottery.setAdminStatus(owner.address, true);
        await lottery.setWinningTicketsCountByLevels([1, 3, 5, 8]);
        await lottery.setMonthlyJackpotAddress(jackpot.address);
        await lottery.setAmountFromCycleToMonthlyJackpot(ethers.parseEther("1000"));

        await lottery.setBonusVaraiablesValues([
            ethers.parseEther("20"), ethers.parseEther("15"), ethers.parseEther("25"), ethers.parseEther("10"),
            10, 10, 3, 10
        ]);

        await token.mint(user1.address, ethers.parseEther("100000"));
        await token.mint(user2.address, ethers.parseEther("100000"));
        await token.mint(user3.address, ethers.parseEther("100000"));
        await token.mint(user4.address, ethers.parseEther("100000"));
        await token.mint(user5.address, ethers.parseEther("100000"));
    }

    beforeEach(async function () {
        [owner, bank, jackpot, user1, user2, user3, user4, user5] = await ethers.getSigners();

        const Lottery = await ethers.getContractFactory("Lottery", owner);
        lottery = await Lottery.deploy();
        lottery.waitForDeployment();

        const Ticket = await ethers.getContractFactory("Ticket", owner);
        ticket = await Ticket.deploy("Mlm Lottery Ticket", "MLT");
        ticket.waitForDeployment();

        const Token = await ethers.getContractFactory("StableToken", owner);
        token = await Token.deploy();
        token.waitForDeployment();

        ticketAddress = await ticket.getAddress();
        lotteryAddress = await lottery.getAddress();
        tokenAddress = await token.getAddress();
        await setAll();
        ticketPrice = await lottery.ticketPrice();

        await token.connect(bank).approve(await lottery.getAddress(), ethers.parseEther("1000000"));
        await token.connect(jackpot).approve(await lottery.getAddress(), ethers.parseEther("1000000"));
    });

    describe("Initialization", function () {
        it("Shuld be deployed with correct args!", async function () {
            expect(await lottery.owner()).to.eq(owner.address);
            expect(await ticket.name()).to.eq("Mlm Lottery Ticket");
            expect(await ticket.symbol()).to.eq("MLT");
            expect(await token.name()).to.eq("Stable Token");
            expect(await token.symbol()).to.eq("ST");
        });
    });

    describe("Start new cycle", function () {
        describe("Start new cycle", function () {
            it("Should be possible to start new cycle!", async function () {
                let cycleCount = await lottery.cycleCount();
                await lottery.startNewCycle();

                expect(await lottery.cycleCount()).to.eq(cycleCount + ethers.toBigInt(1));
                expect(await lottery.isCycleActive()).to.eq(true);
            });
        });

        describe("Check requires", function () {
            it("Should reverted if the caller is not the owner!", async function () {
                let tx = lottery.connect(user1).startNewCycle();

                await expect(tx).to.be.revertedWithCustomError(lottery, "OwnableUnauthorizedAccount");
            });
        });

        describe("Check events", function () {
            it("Should emitted with correct args!", async function () {
                let tx = await lottery.startNewCycle();
                let cycleCount = await lottery.cycleCount();
                let blockTimestamp = await time.latest();

                await expect(tx)
                    .emit(lottery, "NewCycleStarted")
                    .withArgs(owner.address, cycleCount, blockTimestamp);
            });
        });
    });

    describe("Buy Tickets", function () {
        describe("Buy tickets", function () {
            it("Should be possible to buy tickets!", async function () {

                await lottery.startNewCycle();

                //----------------------------------------user1---------------------------------------------------//
                let refId0 = ethers.toBigInt(0);
                let ticketsCount1 = ethers.toBigInt(10);
                await token.connect(user1).approve(lotteryAddress, ticketPrice * ticketsCount1);
                let tx1 = await lottery.connect(user1).buyTickets(ticketsCount1, refId0);
                let userInfo1 = await lottery.getUserInfo(user1.address);

                await expect(tx1)
                    .to.changeTokenBalances(
                        token,
                        [user1, bank],
                        [-ticketPrice * ticketsCount1 + await lottery.bonusParameters(3), ticketPrice * ticketsCount1 - await lottery.bonusParameters(3)]
                    );
                expect(userInfo1[0]).to.eq(ethers.toBigInt(0));
                expect(userInfo1[1]).to.eq(ethers.toBigInt(0));
                expect(userInfo1[2]).to.eq(ethers.toBigInt(0));
                expect(userInfo1[4]).to.eq(ethers.toBigInt(0));
                expect(userInfo1[5]).to.eq(ethers.toBigInt(1));
                expect(userInfo1[3][0]).to.eq(ethers.toBigInt(1));
                expect(userInfo1[3][1]).to.eq(ethers.toBigInt(2));
                expect(userInfo1[3][2]).to.eq(ethers.toBigInt(3));
                expect(await lottery.usersCount()).to.eq(2);
                expect(await ticket.balanceOf(user1.address)).to.eq(10);
                //----------------------------------------user2---------------------------------------------------//
                let refId1 = ethers.toBigInt(1);
                let ticketsCount2 = ethers.toBigInt(2);
                await token.connect(user2).approve(lotteryAddress, ticketPrice * ticketsCount2);
                let tx2 = await lottery.connect(user2).buyTickets(ticketsCount2, refId1);

                let userInfo2 = await lottery.getUserInfo(user2.address);
                userInfo1 = await lottery.getUserInfo(user1.address);

                await expect(tx2)
                    .to.changeTokenBalances(
                        token,
                        [user2, user1, bank],
                        [-ticketPrice * ticketsCount2, ticketPrice * ticketsCount2 / ethers.toBigInt(20), ticketPrice * ticketsCount2 - ticketPrice * ticketsCount2 / ethers.toBigInt(20)]
                    );
                expect(userInfo2[0]).to.eq(ethers.toBigInt(0));
                expect(userInfo2[1]).to.eq(ethers.toBigInt(0));
                expect(userInfo2[2]).to.eq(ethers.toBigInt(0));
                expect(userInfo2[4]).to.eq(ethers.toBigInt(0));
                expect(userInfo2[5]).to.eq(ethers.toBigInt(2));
                expect(userInfo2[3][0]).to.eq(ethers.toBigInt(11));
                expect(userInfo2[3][1]).to.eq(ethers.toBigInt(12));
                expect(userInfo1[2]).to.eq(ethers.toBigInt(2));
                expect(userInfo1[4]).to.eq(ethers.toBigInt(1));
                expect(await lottery.usersCount()).to.eq(3);
                expect(await ticket.balanceOf(user2.address)).to.eq(2);
                //----------------------------------------user3---------------------------------------------------//
                let refId2 = ethers.toBigInt(2);
                let ticketsCount3 = ethers.toBigInt(3);
                await token.connect(user3).approve(lotteryAddress, ticketPrice * ticketsCount3);
                let tx3 = await lottery.connect(user3).buyTickets(ticketsCount3, refId2);

                let userInfo3 = await lottery.getUserInfo(user3.address);
                userInfo1 = await lottery.getUserInfo(user1.address);
                userInfo2 = await lottery.getUserInfo(user2.address);

                await expect(tx3)
                    .to.changeTokenBalances(
                        token,
                        [user3, user2, bank],
                        [-ticketPrice * ticketsCount3, ticketPrice * ticketsCount3 / ethers.toBigInt(20), ticketPrice * ticketsCount3 - ticketPrice * ticketsCount3 / ethers.toBigInt(20)]
                    );
                expect(userInfo3[0]).to.eq(ethers.toBigInt(0));
                expect(userInfo3[1]).to.eq(ethers.toBigInt(0));
                expect(userInfo3[2]).to.eq(ethers.toBigInt(0));
                expect(userInfo3[4]).to.eq(ethers.toBigInt(0));
                expect(userInfo3[5]).to.eq(ethers.toBigInt(3));
                expect(userInfo3[3][0]).to.eq(ethers.toBigInt(13));
                expect(userInfo3[3][1]).to.eq(ethers.toBigInt(14));
                expect(userInfo3[3][2]).to.eq(ethers.toBigInt(15));
                expect(userInfo2[2]).to.eq(ethers.toBigInt(3));
                expect(userInfo2[4]).to.eq(ethers.toBigInt(1));
                expect(await lottery.usersCount()).to.eq(4);
                expect(await ticket.balanceOf(user3.address)).to.eq(3);
                //----------------------------------------user4---------------------------------------------------//
                // ref Id == 1
                let ticketsCount4 = ethers.toBigInt(4);
                await token.connect(user4).approve(lotteryAddress, ticketPrice * ticketsCount4);
                let tx4 = await lottery.connect(user4).buyTickets(ticketsCount4, refId1);

                let userInfo4 = await lottery.getUserInfo(user4.address);
                userInfo1 = await lottery.getUserInfo(user1.address);
                userInfo2 = await lottery.getUserInfo(user2.address);
                userInfo3 = await lottery.getUserInfo(user3.address);

                await expect(tx4)
                    .to.changeTokenBalances(
                        token,
                        [user4, user1, bank],
                        [-ticketPrice * ticketsCount4, ticketPrice * ticketsCount4 / ethers.toBigInt(10), ticketPrice * ticketsCount4 - ticketPrice * ticketsCount4 / ethers.toBigInt(10)]
                    );
                expect(userInfo4[0]).to.eq(ethers.toBigInt(0));
                expect(userInfo4[1]).to.eq(ethers.toBigInt(0));
                expect(userInfo4[2]).to.eq(ethers.toBigInt(0));
                expect(userInfo4[4]).to.eq(ethers.toBigInt(0));
                expect(userInfo4[5]).to.eq(ethers.toBigInt(4));
                expect(userInfo4[3][0]).to.eq(ethers.toBigInt(16));
                expect(userInfo4[3][1]).to.eq(ethers.toBigInt(17));
                expect(userInfo4[3][2]).to.eq(ethers.toBigInt(18));
                expect(userInfo4[3][3]).to.eq(ethers.toBigInt(19));
                expect(userInfo1[2]).to.eq(ethers.toBigInt(6));
                expect(userInfo1[4]).to.eq(ethers.toBigInt(2));
                expect(await lottery.usersCount()).to.eq(5);
                expect(await ticket.balanceOf(user4.address)).to.eq(4);
            });
        });

        describe("Check requires", function () {
            it("Should be reverted if the cycle closed!", async function () {
                let refId0 = ethers.toBigInt(0);
                let ticketsCount1 = ethers.toBigInt(10);
                let tx1 = lottery.connect(user1).buyTickets(ticketsCount1, refId0);

                await expect(tx1).to.be.revertedWith("Lottery: Currently you can not buy new tickets");
            });

            it("Should be reverted if the count of want tickets is 0!", async function () {
                await lottery.startNewCycle();

                let refId0 = ethers.toBigInt(0);
                let ticketsCount1 = ethers.toBigInt(0);
                let tx1 = lottery.connect(user1).buyTickets(ticketsCount1, refId0);

                await expect(tx1).to.be.revertedWith("Lottery: Count of tickets can not be 0");
            });

            it("Should be reverted if the user has not given enough allowance!", async function () {
                await lottery.startNewCycle();

                let refId0 = ethers.toBigInt(0);
                let ticketsCount1 = ethers.toBigInt(1);
                let tx1 = lottery.connect(user1).buyTickets(ticketsCount1, refId0);

                await expect(tx1).to.be.revertedWith("Lottery: User has not given enough allowance");
            });

            it("Should be reverted if there are not enough tickets to buy!", async function () {
                await lottery.startNewCycle();

                let refId0 = ethers.toBigInt(0);
                let ticketsCount1 = await lottery.numberOfTickets() + ethers.toBigInt(1);
                await token.connect(user1).approve(lotteryAddress, ticketPrice * ticketsCount1);
                let tx1 = lottery.connect(user1).buyTickets(ticketsCount1, refId0);

                await expect(tx1).to.be.revertedWith("Lottery: tickets count + sold tickets count must be smaller than number of available tickets");
            });

            it("Should be reverted if user want to set referrer but already has!", async function () {
                await lottery.startNewCycle();

                let refId0 = ethers.toBigInt(0);
                let ticketsCount1 = ethers.toBigInt(1);
                await token.connect(user1).approve(lotteryAddress, ticketPrice * ticketsCount1);
                await lottery.connect(user1).buyTickets(ticketsCount1, refId0);

                let refId1 = ethers.toBigInt(1);
                let ticketsCount2 = ethers.toBigInt(1);
                await token.connect(user2).approve(lotteryAddress, ticketPrice * ticketsCount2);
                await lottery.connect(user2).buyTickets(ticketsCount2, refId1);

                refId1 = ethers.toBigInt(2);
                await token.connect(user2).approve(lotteryAddress, ticketPrice * ticketsCount2);
                let tx2 = lottery.connect(user2).buyTickets(ticketsCount2, refId1);

                await expect(tx2).to.be.revertedWith("Lottery: your referrer is already set and it is another user");
            });

            it("Should be reverted if user want to set as referrer own address!", async function () {
                await lottery.startNewCycle();

                let refId1 = ethers.toBigInt(1);
                let ticketsCount1 = ethers.toBigInt(1);
                await token.connect(user1).approve(lotteryAddress, ticketPrice * ticketsCount1);
                let tx1 = lottery.connect(user1).buyTickets(ticketsCount1, refId1);

                await expect(tx1).to.be.revertedWith("Lottery: Incorrect ID!");
            });
        });

        describe("Check events", function () {
            it("Should emitted with correct args!", async function () {
                await lottery.startNewCycle();

                let refId0 = ethers.toBigInt(0);
                let ticketsCount1 = ethers.toBigInt(3);
                await token.connect(user1).approve(lotteryAddress, ticketPrice * ticketsCount1);
                let tx1 = await lottery.connect(user1).buyTickets(ticketsCount1, refId0);
                let txTime1 = time.latest;

                let refId1 = ethers.toBigInt(1);
                let ticketsCount2 = ethers.toBigInt(2);
                await token.connect(user2).approve(lotteryAddress, ticketPrice * ticketsCount2);
                let tx2 = await lottery.connect(user2).buyTickets(ticketsCount2, refId1);
                let txTime2 = time.latest;

                await expect(tx1)
                    .emit(token, "Transfer")
                    .withArgs(user1.address, bank.address, ticketPrice * ticketsCount1);
                await expect(tx2)
                    .emit(token, "Transfer")
                    .withArgs(user2.address, bank.address, ticketPrice * ticketsCount2);
                await expect(tx2)
                    .emit(token, "Transfer")
                    .withArgs(bank.address, user1.address, ticketPrice * ticketsCount2 / ethers.toBigInt(20));
                await expect(tx1)
                    .emit(ticket, "Transfer")
                    .withArgs(ethers.ZeroAddress, user1.address, 1);
                await expect(tx1)
                    .emit(ticket, "Transfer")
                    .withArgs(ethers.ZeroAddress, user1.address, 2);
                await expect(tx1)
                    .emit(ticket, "Transfer")
                    .withArgs(ethers.ZeroAddress, user1.address, 3);
                await expect(tx2)
                    .emit(ticket, "Transfer")
                    .withArgs(ethers.ZeroAddress, user2.address, 4);
                await expect(tx2)
                    .emit(ticket, "Transfer")
                    .withArgs(ethers.ZeroAddress, user2.address, 5);
                await expect(tx1)
                    .emit(lottery, "TicketBought")
                    .withArgs(user1.address, ticketsCount1);
                await expect(tx2)
                    .emit(lottery, "TicketBought")
                    .withArgs(user2.address, ticketsCount2);
            });
        });
    });

    describe("Reward winners", function () {
        describe("Reward winners", function () {
            it("Should be possible to reward to winners!", async function () {
                await lottery.startNewCycle();

                let refId0 = ethers.toBigInt(0);
                let ticketsCount1 = ethers.toBigInt(110);
                await token.connect(user1).approve(lotteryAddress, ticketPrice * ticketsCount1);
                await lottery.connect(user1).buyTickets(ticketsCount1, refId0);

                let refId1 = ethers.toBigInt(1);
                let ticketsCount2 = ethers.toBigInt(240);
                await token.connect(user2).approve(lotteryAddress, ticketPrice * ticketsCount2);
                await lottery.connect(user2).buyTickets(ticketsCount2, refId1);

                //refId1
                let ticketsCount3 = ethers.toBigInt(100);
                await token.connect(user3).approve(lotteryAddress, ticketPrice * ticketsCount3);
                await lottery.connect(user3).buyTickets(ticketsCount3, refId1);

                let refId2 = ethers.toBigInt(2);
                let ticketsCount4 = ethers.toBigInt(250);
                await token.connect(user4).approve(lotteryAddress, ticketPrice * ticketsCount4);
                await lottery.connect(user4).buyTickets(ticketsCount4, refId2);

                let refId3 = ethers.toBigInt(3);
                let ticketsCount5 = ethers.toBigInt(77);
                await token.connect(user5).approve(lotteryAddress, ticketPrice * ticketsCount5);
                await lottery.connect(user5).buyTickets(ticketsCount5, refId3);

                let userBalanceChanges = {
                    [user1.address]: ethers.toBigInt(0),
                    [user2.address]: ethers.toBigInt(0),
                    [user3.address]: ethers.toBigInt(0),
                    [user4.address]: ethers.toBigInt(0),
                    [user5.address]: ethers.toBigInt(0)
                }
                let winningTicketsCount = await lottery.winningTicketsCount();
                let txReward = await lottery.rewardWinners();

                for (let i = 0; i < winningTicketsCount; ++i) {
                    if (i < await lottery.winningTicketsCountByLevels(0))
                        await rewardingReferrers(await lottery.winningAmounts(0), await lottery.ticketNumberToAddress(await lottery.winningTickets(i)));
                    else if (i >= await lottery.winningTicketsCountByLevels(0) && i < await lottery.winningTicketsCountByLevels(1) + await lottery.winningTicketsCountByLevels(0))
                        await rewardingReferrers(await lottery.winningAmounts(1), await lottery.ticketNumberToAddress(await lottery.winningTickets(i)));
                    else if (i >= await lottery.winningTicketsCountByLevels(1) + await lottery.winningTicketsCountByLevels(0) && i < await lottery.winningTicketsCountByLevels(2) + await lottery.winningTicketsCountByLevels(1) + await lottery.winningTicketsCountByLevels(0))
                        await rewardingReferrers(await lottery.winningAmounts(2), await lottery.ticketNumberToAddress(await lottery.winningTickets(i)));
                    else if (i >= await lottery.winningTicketsCountByLevels(2) + await lottery.winningTicketsCountByLevels(1) + await lottery.winningTicketsCountByLevels(0) && i < winningTicketsCount)
                        await rewardingReferrers(await lottery.winningAmounts(3), await lottery.ticketNumberToAddress(await lottery.winningTickets(i)));

                }

                async function rewardingReferrers(winningAmount, winnerAddress) {
                    let temp = await lottery.addressToHisReferrer(winnerAddress);
                    userBalanceChanges[winnerAddress] += winningAmount;

                    for (let j = 0; j < 3; ++j) {
                        if (temp == owner.address)
                            break;
                        if (j == 0)
                            userBalanceChanges[temp] += (winningAmount * await lottery.parentsPercentages(0)) / ethers.toBigInt(100);
                        else if (j == 1)
                            userBalanceChanges[temp] += (winningAmount * await lottery.parentsPercentages(1)) / ethers.toBigInt(100);
                        else if (j == 2)
                            userBalanceChanges[temp] += (winningAmount * await lottery.parentsPercentages(2)) / ethers.toBigInt(100);
                        temp = await lottery.addressToHisReferrer(temp);
                    }
                }

                await expect(txReward).to.changeTokenBalances(
                    token,
                    [user1, user2, user3],
                    [
                        userBalanceChanges[user1.address],
                        userBalanceChanges[user2.address],
                        userBalanceChanges[user3.address],
                    ]
                );

                await expect(txReward).to.changeTokenBalances(
                    token,
                    [user4, user5, bank],
                    [
                        userBalanceChanges[user4.address],
                        userBalanceChanges[user5.address],
                        -(userBalanceChanges[user1.address] + userBalanceChanges[user2.address] + userBalanceChanges[user3.address] + userBalanceChanges[user4.address] + userBalanceChanges[user5.address])
                    ]
                );

            });

            it("Should be possible to reward to winners(after 3 cycle)!", async function () {
                await lottery.setTicketsNumber(100);
                let winningTicketsCount = await lottery.winningTicketsCount();
                let userBalanceChanges = {
                    [user1.address]: ethers.toBigInt(0),
                    [user2.address]: ethers.toBigInt(0),
                    [user3.address]: ethers.toBigInt(0),
                    [user4.address]: ethers.toBigInt(0),
                    [user5.address]: ethers.toBigInt(0)
                }
                //1st cycle
                await lottery.startNewCycle();
                await buy();
                await lottery.rewardWinners();
                //2nd cycle
                await lottery.startNewCycle();
                await buy();
                await lottery.rewardWinners();

                let userinfo = {
                    [user1.address]: await lottery.getUserInfo(user1.address),
                    [user3.address]: await lottery.getUserInfo(user2.address),
                    [user4.address]: await lottery.getUserInfo(user3.address),
                    [user2.address]: await lottery.getUserInfo(user4.address),
                    [user5.address]: await lottery.getUserInfo(user5.address)
                }

                //3rd cycle
                await lottery.startNewCycle();
                await buy();
                let txReward3 = await lottery.rewardWinners();

                for (let i = 0; i < winningTicketsCount; ++i) {
                    if (i < await lottery.winningTicketsCountByLevels(0))
                        await rewardingReferrers(await lottery.winningAmounts(0), await lottery.ticketNumberToAddress(await lottery.winningTickets(i)));
                    else if (i >= await lottery.winningTicketsCountByLevels(0) && i < await lottery.winningTicketsCountByLevels(1) + await lottery.winningTicketsCountByLevels(0))
                        await rewardingReferrers(await lottery.winningAmounts(1), await lottery.ticketNumberToAddress(await lottery.winningTickets(i)));
                    else if (i >= await lottery.winningTicketsCountByLevels(1) + await lottery.winningTicketsCountByLevels(0) && i < await lottery.winningTicketsCountByLevels(2) + await lottery.winningTicketsCountByLevels(1) + await lottery.winningTicketsCountByLevels(0))
                        await rewardingReferrers(await lottery.winningAmounts(2), await lottery.ticketNumberToAddress(await lottery.winningTickets(i)));
                    else if (i >= await lottery.winningTicketsCountByLevels(2) + await lottery.winningTicketsCountByLevels(1) + await lottery.winningTicketsCountByLevels(0) && i < winningTicketsCount)
                        await rewardingReferrers(await lottery.winningAmounts(3), await lottery.ticketNumberToAddress(await lottery.winningTickets(i)));

                    if (userinfo[await lottery.ticketNumberToAddress(await lottery.winningTickets(i))][0] == (await lottery.bonusParameters(6) - ethers.toBigInt(1))) {
                        userinfo[await lottery.ticketNumberToAddress(await lottery.winningTickets(i))] = await lottery.getUserInfo(await lottery.ticketNumberToAddress(await lottery.winningTickets(i)));
                        userBalanceChanges[await lottery.ticketNumberToAddress(await lottery.winningTickets(i))] += await lottery.bonusParameters(2);
                    }
                }

                async function buy() {
                    let refId0 = ethers.toBigInt(0);
                    let ticketsCount1 = ethers.toBigInt(50);
                    await token.connect(user1).approve(lotteryAddress, ticketPrice * ticketsCount1);
                    await lottery.connect(user1).buyTickets(ticketsCount1, refId0);

                    let refId1 = ethers.toBigInt(1);
                    let ticketsCount2 = ethers.toBigInt(25);
                    await token.connect(user2).approve(lotteryAddress, ticketPrice * ticketsCount2);
                    await lottery.connect(user2).buyTickets(ticketsCount2, refId1);

                    //refId1
                    let ticketsCount3 = ethers.toBigInt(5);
                    await token.connect(user3).approve(lotteryAddress, ticketPrice * ticketsCount3);
                    await lottery.connect(user3).buyTickets(ticketsCount3, refId1);

                    let refId2 = ethers.toBigInt(2);
                    let ticketsCount4 = ethers.toBigInt(11);
                    await token.connect(user4).approve(lotteryAddress, ticketPrice * ticketsCount4);
                    await lottery.connect(user4).buyTickets(ticketsCount4, refId2);

                    let refId3 = ethers.toBigInt(3);
                    let ticketsCount5 = ethers.toBigInt(9);
                    await token.connect(user5).approve(lotteryAddress, ticketPrice * ticketsCount5);
                    await lottery.connect(user5).buyTickets(ticketsCount5, refId3);
                }

                async function rewardingReferrers(winningAmount, winnerAddress) {
                    let temp = await lottery.addressToHisReferrer(winnerAddress);
                    userBalanceChanges[winnerAddress] += winningAmount;

                    for (let j = 0; j < 3; ++j) {
                        if (temp == owner.address)
                            break;
                        userBalanceChanges[temp] += (winningAmount * await lottery.parentsPercentages(j)) / ethers.toBigInt(100);

                        temp = await lottery.addressToHisReferrer(temp);
                    }
                }
                // console.log(`user1: ${userBalanceChanges[user1.address]}`);
                // console.log(`user2: ${userBalanceChanges[user2.address]}`);
                // console.log(`user3: ${userBalanceChanges[user3.address]}`);
                // console.log(`user4: ${userBalanceChanges[user4.address]}`);
                // console.log(`user5: ${userBalanceChanges[user5.address]}`);
                await expect(txReward3).to.changeTokenBalances(
                    token,
                    [user1, user2, user3, user4, user5, bank],
                    [
                        userBalanceChanges[user1.address],
                        userBalanceChanges[user2.address],
                        userBalanceChanges[user3.address],
                        userBalanceChanges[user4.address],
                        userBalanceChanges[user5.address],
                        -(userBalanceChanges[user1.address] + userBalanceChanges[user2.address] + userBalanceChanges[user3.address] + userBalanceChanges[user4.address] + userBalanceChanges[user5.address])
                    ]
                );

            });
        });

        describe("Check requires", function () {
            it("Should be reverted if the the caller is not the owner!", async function () {
                let tx = lottery.connect(user1).rewardWinners();
                await expect(tx).to.be.revertedWithCustomError(lottery, "OwnableUnauthorizedAccount");
            });

            it("Should be reverted if the cycle is open!", async function () {
                await lottery.startNewCycle();
                let tx1 = lottery.rewardWinners();
                await expect(tx1).to.be.revertedWith("Lottery: You can call rewardWinners function only after quiting cycle");
            });
        });

        describe("Check events", function () {
            it("Should emitted with correct args!", async function () {
                await lottery.startNewCycle();

                let refId0 = ethers.toBigInt(0);
                let ticketsCount1 = ethers.toBigInt(110);
                await token.connect(user1).approve(lotteryAddress, ticketPrice * ticketsCount1);
                await lottery.connect(user1).buyTickets(ticketsCount1, refId0);

                let refId1 = ethers.toBigInt(1);
                let ticketsCount2 = ethers.toBigInt(240);
                await token.connect(user2).approve(lotteryAddress, ticketPrice * ticketsCount2);
                await lottery.connect(user2).buyTickets(ticketsCount2, refId1);

                //refId1
                let ticketsCount3 = ethers.toBigInt(100);
                await token.connect(user3).approve(lotteryAddress, ticketPrice * ticketsCount3);
                await lottery.connect(user3).buyTickets(ticketsCount3, refId1);

                let refId2 = ethers.toBigInt(2);
                let ticketsCount4 = ethers.toBigInt(250);
                await token.connect(user4).approve(lotteryAddress, ticketPrice * ticketsCount4);
                await lottery.connect(user4).buyTickets(ticketsCount4, refId2);

                let refId3 = ethers.toBigInt(3);
                let ticketsCount5 = ethers.toBigInt(77);
                await token.connect(user5).approve(lotteryAddress, ticketPrice * ticketsCount5);
                await lottery.connect(user5).buyTickets(ticketsCount5, refId3);


                let txReward = await lottery.rewardWinners();
                let winningTicketsCount = await lottery.winningTicketsCount();

                async function rewardingReferrers(winningAmount, winnerAddress) {
                    let temp = await lottery.addressToHisReferrer(winnerAddress);
                    await expect(txReward).to.emit(token, "Transfer").withArgs(bank.address, winnerAddress, winningAmount);

                    for (let j = 0; j < 3; ++j) {
                        if (temp == owner.address)
                            break;
                        if (j == 0)
                            await expect(txReward).to.emit(token, "Transfer").withArgs(bank.address, temp, (winningAmount * await lottery.parentsPercentages(0)) / ethers.toBigInt(100));
                        else if (j == 1)
                            await expect(txReward).to.emit(token, "Transfer").withArgs(bank.address, temp, (winningAmount * await lottery.parentsPercentages(1)) / ethers.toBigInt(100));
                        else if (j == 2)
                            await expect(txReward).to.emit(token, "Transfer").withArgs(bank.address, temp, (winningAmount * await lottery.parentsPercentages(2)) / ethers.toBigInt(100));
                        temp = await lottery.addressToHisReferrer(temp);
                    }
                }

                for (let i = 0; i < winningTicketsCount; ++i) {
                    if (i < await lottery.winningTicketsCountByLevels(0))
                        await rewardingReferrers(await lottery.winningAmounts(0), await lottery.ticketNumberToAddress(await lottery.winningTickets(i)));
                    else if (i >= await lottery.winningTicketsCountByLevels(0) && i < await lottery.winningTicketsCountByLevels(1) + await lottery.winningTicketsCountByLevels(0))
                        await rewardingReferrers(await lottery.winningAmounts(1), await lottery.ticketNumberToAddress(await lottery.winningTickets(i)));
                    else if (i >= await lottery.winningTicketsCountByLevels(1) + await lottery.winningTicketsCountByLevels(0) && i < await lottery.winningTicketsCountByLevels(2) + await lottery.winningTicketsCountByLevels(1) + await lottery.winningTicketsCountByLevels(0))
                        await rewardingReferrers(await lottery.winningAmounts(2), await lottery.ticketNumberToAddress(await lottery.winningTickets(i)));
                    else if (i >= await lottery.winningTicketsCountByLevels(2) + await lottery.winningTicketsCountByLevels(1) + await lottery.winningTicketsCountByLevels(0) && i < winningTicketsCount)
                        await rewardingReferrers(await lottery.winningAmounts(3), await lottery.ticketNumberToAddress(await lottery.winningTickets(i)));

                    // Need to fix !!!

                    // if (await lottery.cycleCount() > userInfo[1]) {
                    //     if (await lottery.cycleCount() - userInfo[1] == 1) {
                    //         userInfo[0]++;
                    //         if (userInfo[0] == bonusParameters[6]) {
                    //             winningInRowBonus(await lottery.ticketNumberToAddress(await lottery.winningTickets(i)));
                    //             userInfo[0] = 0;
                    //         }
                    //     }
                    //     else {
                    //         userInfo[0] = 1;
                    //     }
                    //     userInfo[1] = await lottery.cycleCount();
                    // }
                }

                let timestamp = time.latest;
                await expect(txReward).to.emit(lottery, "WinnersRewarded").withArgs(owner.address);
            });
        });
    });

    describe("Monthly jackpot", function () {
        it("Monthly jackpot", async function () {
            await lottery.startNewCycle();

            let refId0 = ethers.toBigInt(0);
            let ticketsCount1 = ethers.toBigInt(200);
            await token.connect(user1).approve(lotteryAddress, ticketPrice * ticketsCount1);
            await lottery.connect(user1).buyTickets(ticketsCount1, refId0);

            let refId1 = ethers.toBigInt(1);
            let ticketsCount2 = ethers.toBigInt(100);
            await token.connect(user2).approve(lotteryAddress, ticketPrice * ticketsCount2);
            await lottery.connect(user2).buyTickets(ticketsCount2, refId1);

            //refId1
            let ticketsCount3 = ethers.toBigInt(200);
            await token.connect(user3).approve(lotteryAddress, ticketPrice * ticketsCount3);
            await lottery.connect(user3).buyTickets(ticketsCount3, refId1);

            let refId2 = ethers.toBigInt(2);
            let ticketsCount4 = ethers.toBigInt(100);
            await token.connect(user4).approve(lotteryAddress, ticketPrice * ticketsCount4);
            await lottery.connect(user4).buyTickets(ticketsCount4, refId2);

            let refId3 = ethers.toBigInt(3);
            let ticketsCount5 = ethers.toBigInt(177);
            await token.connect(user5).approve(lotteryAddress, ticketPrice * ticketsCount5);
            await lottery.connect(user5).buyTickets(ticketsCount5, refId3);

            await time.increase(2592000);
            let amount = await lottery.monthlyJackpotWinningAmount();
            let txJackpot = await lottery.monthlyJackpotExecuting();
            let msg = ethers.solidityPackedKeccak256(["uint256", "uint256", "address"], [await time.latest(), await ethers.provider.getBlockNumber(), owner.address]);
            let id = ethers.toBigInt(msg) % (await lottery.usersCount() - ethers.toBigInt(1)) + ethers.toBigInt(1);
            let jackpotWinner = await lottery.idToHisAddress(id);

            await expect(txJackpot).to.changeTokenBalances(token, [jackpotWinner, jackpot.address], [amount, -amount]);
        });
    });
});