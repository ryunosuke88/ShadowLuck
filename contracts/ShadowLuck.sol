// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {FHE, ebool, euint64, euint8, externalEuint8} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {ShadowLuckWETH} from "./wrapETH.sol";

contract ShadowLuck is ZamaEthereumConfig {
    uint256 public constant TICKET_PRICE = 0.001 ether;

    struct PlayerState {
        euint8 firstPick;
        euint8 secondPick;
        euint8 lastDrawOne;
        euint8 lastDrawTwo;
        euint64 score;
        euint64 lastReward;
        uint64 roundsPlayed;
        bool hasTicket;
    }

    ShadowLuckWETH public immutable rewardToken;
    mapping(address => PlayerState) private players;

    event TicketPurchased(address indexed player, uint64 indexed roundId);
    event RoundPlayed(address indexed player, uint64 indexed roundId, euint8 drawOne, euint8 drawTwo, euint64 reward);

    constructor(address rewardTokenAddress) {
        rewardToken = ShadowLuckWETH(rewardTokenAddress);
    }

    function buyTicket(externalEuint8 firstPick, externalEuint8 secondPick, bytes calldata inputProof) external payable {
        require(msg.value == TICKET_PRICE, "Ticket price is 0.001 ether");

        PlayerState storage state = players[msg.sender];
        _ensureScoreInitialized(state, msg.sender);

        euint8 parsedFirst = FHE.fromExternal(firstPick, inputProof);
        euint8 parsedSecond = FHE.fromExternal(secondPick, inputProof);

        state.firstPick = parsedFirst;
        state.secondPick = parsedSecond;
        state.hasTicket = true;

        FHE.allowThis(parsedFirst);
        FHE.allowThis(parsedSecond);
        FHE.allow(parsedFirst, msg.sender);
        FHE.allow(parsedSecond, msg.sender);

        emit TicketPurchased(msg.sender, state.roundsPlayed + 1);
    }

    function playRound() external {
        PlayerState storage state = players[msg.sender];
        require(state.hasTicket, "No active ticket");

        euint8 drawOne = _drawNumber();
        euint8 drawTwo = _drawNumber();

        ebool firstMatch = FHE.or(FHE.eq(state.firstPick, drawOne), FHE.eq(state.firstPick, drawTwo));
        ebool secondMatch = FHE.or(FHE.eq(state.secondPick, drawOne), FHE.eq(state.secondPick, drawTwo));
        ebool anyMatch = FHE.or(firstMatch, secondMatch);
        ebool doubleMatch = FHE.and(firstMatch, secondMatch);

        euint64 reward = FHE.select(doubleMatch, _doubleReward(), FHE.select(anyMatch, _singleReward(), FHE.asEuint64(0)));

        euint64 updatedScore = FHE.add(state.score, reward);
        FHE.allowThis(updatedScore);
        FHE.allow(updatedScore, msg.sender);
        state.score = updatedScore;

        state.lastReward = reward;
        FHE.allowThis(state.lastReward);
        FHE.allow(state.lastReward, msg.sender);

        state.lastDrawOne = drawOne;
        state.lastDrawTwo = drawTwo;
        FHE.allowThis(drawOne);
        FHE.allowThis(drawTwo);
        FHE.allow(drawOne, msg.sender);
        FHE.allow(drawTwo, msg.sender);

        state.hasTicket = false;
        state.roundsPlayed += 1;

        FHE.allowTransient(reward, address(rewardToken));
        rewardToken.mint(msg.sender, reward);

        emit RoundPlayed(msg.sender, state.roundsPlayed, drawOne, drawTwo, reward);
    }

    function getEncryptedScore(address player) external view returns (euint64) {
        return players[player].score;
    }

    function getTicket(address player) external view returns (euint8, euint8, bool) {
        PlayerState storage state = players[player];
        return (state.firstPick, state.secondPick, state.hasTicket);
    }

    function getLastResult(address player) external view returns (euint8, euint8, euint64, uint64, bool) {
        PlayerState storage state = players[player];
        return (state.lastDrawOne, state.lastDrawTwo, state.lastReward, state.roundsPlayed, state.hasTicket);
    }

    function ticketPrice() external pure returns (uint256) {
        return TICKET_PRICE;
    }

    function getRewardToken() external view returns (address) {
        return address(rewardToken);
    }

    function _drawNumber() internal returns (euint8) {
        euint8 randomValue = FHE.randEuint8();
        euint8 bounded = FHE.rem(randomValue, 9);
        return FHE.add(bounded, FHE.asEuint8(1));
    }

    function _singleReward() internal returns (euint64) {
        return FHE.asEuint64(1_000_000_000_000_000);
    }

    function _doubleReward() internal returns (euint64) {
        return FHE.asEuint64(10_000_000_000_000_000);
    }

    function _ensureScoreInitialized(PlayerState storage state, address player) internal {
        if (!FHE.isInitialized(state.score)) {
            euint64 base = FHE.asEuint64(0);
            FHE.allowThis(base);
            FHE.allow(base, player);
            state.score = base;
        } else {
            FHE.allow(state.score, player);
        }
    }
}
