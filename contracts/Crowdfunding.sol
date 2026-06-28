// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title CrowdChain - Decentralized Crowdfunding Platform
 * @notice No admin. Fully community-governed via voting.
 * @dev Creators must be verified by community vote before creating campaigns.
 */
contract Crowdfunding {

    // ─────────────────────────────────────────────
    //  CONFIGURATION
    // ─────────────────────────────────────────────

    /// Minimum upvotes needed for a creator to be verified
    uint public constant VOTE_THRESHOLD = 5;


    // ─────────────────────────────────────────────
    //  STRUCTS
    // ─────────────────────────────────────────────

    struct CreatorApplication {
        address creatorAddress;
        string  ipfsDocHash;      // IPFS CID of the uploaded PDF
        uint    upvotes;
        uint    downvotes;
        bool    verified;         // true once upvotes >= VOTE_THRESHOLD
        bool    exists;           // guard: has the creator applied?
        mapping(address => bool) hasVoted; // prevent double voting
    }

    struct Campaign {
        uint    id;
        address creator;
        string  title;
        string  description;
        uint    goal;             // in wei
        uint    deadline;         // unix timestamp
        uint    amountRaised;
        bool    withdrawn;        // creator already withdrew funds
        bool    exists;
    }


    // ─────────────────────────────────────────────
    //  STATE VARIABLES
    // ─────────────────────────────────────────────

    /// creator address → their application
    mapping(address => CreatorApplication) public creatorApplications;

    /// campaignId → Campaign
    mapping(uint => Campaign) public campaigns;

    /// campaignId → contributor address → amount contributed (for refunds)
    mapping(uint => mapping(address => uint)) public contributions;

    /// total number of campaigns created
    uint public campaignCount;


    // ─────────────────────────────────────────────
    //  EVENTS
    // ─────────────────────────────────────────────

    event ApplicationSubmitted(address indexed creator, string ipfsHash);
    event Voted(address indexed voter, address indexed creator, bool upvote);
    event CreatorVerified(address indexed creator);
    event CampaignCreated(uint indexed campaignId, address indexed creator, string title);
    event CampaignEdited(uint indexed campaignId, string newTitle, string newDescription);
    event Contributed(uint indexed campaignId, address indexed contributor, uint amount);
    event FundsWithdrawn(uint indexed campaignId, address indexed creator, uint amount);
    event Refunded(uint indexed campaignId, address indexed contributor, uint amount);


    // ─────────────────────────────────────────────
    //  MODIFIERS
    // ─────────────────────────────────────────────

    modifier onlyVerified() {
        require(creatorApplications[msg.sender].verified, "Not a verified creator");
        _;
    }

    modifier campaignExists(uint _id) {
        require(campaigns[_id].exists, "Campaign does not exist");
        _;
    }


    // ─────────────────────────────────────────────
    //  1. CREATOR VERIFICATION
    // ─────────────────────────────────────────────

    /**
     * @notice Submit a verification application with an IPFS document hash.
     * @param _ipfsDocHash The IPFS CID of the uploaded proof PDF.
     */
    function applyForVerification(string calldata _ipfsDocHash) external {
        require(!creatorApplications[msg.sender].exists, "Already applied");
        require(bytes(_ipfsDocHash).length > 0, "IPFS hash cannot be empty");

        CreatorApplication storage app = creatorApplications[msg.sender];
        app.creatorAddress = msg.sender;
        app.ipfsDocHash    = _ipfsDocHash;
        app.upvotes        = 0;
        app.downvotes      = 0;
        app.verified       = false;
        app.exists         = true;

        emit ApplicationSubmitted(msg.sender, _ipfsDocHash);
    }


    // ─────────────────────────────────────────────
    //  2. VOTING SYSTEM
    // ─────────────────────────────────────────────

    /**
     * @notice Cast a vote on a creator's verification application.
     * @param _creator Address of the creator being voted on.
     * @param _upvote  true = upvote, false = downvote.
     */
    function voteOnCreator(address _creator, bool _upvote) external {
        CreatorApplication storage app = creatorApplications[_creator];

        require(app.exists,                          "Creator has not applied");
        require(!app.verified,                       "Creator already verified");
        require(msg.sender != _creator,              "Cannot vote on yourself");
        require(!app.hasVoted[msg.sender],           "Already voted on this creator");

        app.hasVoted[msg.sender] = true;

        if (_upvote) {
            app.upvotes++;
            // Auto-verify once threshold is reached
            if (app.upvotes >= VOTE_THRESHOLD) {
                app.verified = true;
                emit CreatorVerified(_creator);
            }
        } else {
            app.downvotes++;
        }

        emit Voted(msg.sender, _creator, _upvote);
    }


    // ─────────────────────────────────────────────
    //  3. CAMPAIGN CREATION
    // ─────────────────────────────────────────────

    /**
     * @notice Create a new fundraising campaign (only verified creators).
     * @param _title       Campaign title.
     * @param _description Campaign description.
     * @param _goal        Funding goal in wei.
     * @param _deadline    Unix timestamp — must be in the future.
     */
    function createCampaign(
        string calldata _title,
        string calldata _description,
        uint            _goal,
        uint            _deadline
    ) external onlyVerified returns (uint) {
        require(bytes(_title).length > 0,       "Title required");
        require(_goal > 0,                       "Goal must be > 0");
        require(_deadline > block.timestamp,     "Deadline must be in future");

        uint id = campaignCount;
        campaignCount++;

        Campaign storage c = campaigns[id];
        c.id           = id;
        c.creator      = msg.sender;
        c.title        = _title;
        c.description  = _description;
        c.goal         = _goal;
        c.deadline     = _deadline;
        c.amountRaised = 0;
        c.withdrawn    = false;
        c.exists       = true;

        emit CampaignCreated(id, msg.sender, _title);
        return id;
    }


    // ─────────────────────────────────────────────
    //  4. FUNDING
    // ─────────────────────────────────────────────

    /**
     * @notice Contribute ETH to a campaign.
     * @param _campaignId The ID of the campaign to fund.
     */
    function contribute(uint _campaignId) external payable campaignExists(_campaignId) {
        Campaign storage c = campaigns[_campaignId];

        require(block.timestamp < c.deadline, "Campaign has ended");
        require(msg.value > 0,                "Must send ETH");

        c.amountRaised                        += msg.value;
        contributions[_campaignId][msg.sender] += msg.value;

        emit Contributed(_campaignId, msg.sender, msg.value);
    }


    // ─────────────────────────────────────────────
    //  5. WITHDRAWAL
    // ─────────────────────────────────────────────

    /**
     * @notice Creator withdraws funds after goal is met and deadline passed.
     * @param _campaignId The campaign ID.
     */
    function withdrawFunds(uint _campaignId) external campaignExists(_campaignId) {
        Campaign storage c = campaigns[_campaignId];

        require(msg.sender == c.creator,      "Only creator can withdraw");
        require(block.timestamp >= c.deadline, "Deadline not yet reached");
        require(c.amountRaised >= c.goal,     "Funding goal not reached");
        require(!c.withdrawn,                  "Already withdrawn");

        c.withdrawn = true;
        uint amount = c.amountRaised;

        // CEI pattern: state updated BEFORE transfer (reentrancy guard)
        (bool success, ) = payable(c.creator).call{value: amount}("");
        require(success, "Transfer failed");

        emit FundsWithdrawn(_campaignId, c.creator, amount);
    }


    // ─────────────────────────────────────────────
    //  6. REFUND
    // ─────────────────────────────────────────────

    /**
     * @notice Contributor claims a refund if campaign goal was not met.
     * @param _campaignId The campaign ID.
     */
    function refund(uint _campaignId) external campaignExists(_campaignId) {
        Campaign storage c = campaigns[_campaignId];

        require(block.timestamp >= c.deadline, "Campaign still active");
        require(c.amountRaised < c.goal,       "Goal was reached - no refund");

        uint contributed = contributions[_campaignId][msg.sender];
        require(contributed > 0, "Nothing to refund");

        // CEI: zero out before transfer
        contributions[_campaignId][msg.sender] = 0;

        (bool success, ) = payable(msg.sender).call{value: contributed}("");
        require(success, "Refund transfer failed");

        emit Refunded(_campaignId, msg.sender, contributed);
    }


    // ─────────────────────────────────────────────
    //  7. EDIT CAMPAIGN
    // ─────────────────────────────────────────────

    /**
     * @notice Creator can update title and description of their campaign.
     *         Goal and deadline are intentionally locked — changing them
     *         after contributors have sent ETH would be unfair.
     * @param _campaignId  The campaign to edit.
     * @param _title       New title (must not be empty).
     * @param _description New description.
     */
    function editCampaign(
        uint            _campaignId,
        string calldata _title,
        string calldata _description
    ) external campaignExists(_campaignId) {
        Campaign storage c = campaigns[_campaignId];

        require(msg.sender == c.creator, "Only the creator can edit this campaign");
        require(!c.withdrawn,            "Campaign already closed");
        require(bytes(_title).length > 0, "Title cannot be empty");

        c.title       = _title;
        c.description = _description;

        emit CampaignEdited(_campaignId, _title, _description);
    }

    // ─────────────────────────────────────────────
    //  8. DATA FETCHING — VIEW FUNCTIONS
    // ─────────────────────────────────────────────

    /// @notice Returns total campaign count.
    function getCampaignCount() external view returns (uint) {
        return campaignCount;
    }

    /// @notice Returns all details of a campaign.
    function getCampaignDetails(uint _campaignId)
        external
        view
        campaignExists(_campaignId)
        returns (
            uint    id,
            address creator,
            string  memory title,
            string  memory description,
            uint    goal,
            uint    deadline,
            uint    amountRaised,
            bool    withdrawn
        )
    {
        Campaign storage c = campaigns[_campaignId];
        return (
            c.id,
            c.creator,
            c.title,
            c.description,
            c.goal,
            c.deadline,
            c.amountRaised,
            c.withdrawn
        );
    }

    /// @notice Returns creator's IPFS proof hash and verification status.
    function getCreatorProof(address _creator)
        external
        view
        returns (
            string memory ipfsHash,
            bool          verified,
            bool          applied
        )
    {
        CreatorApplication storage app = creatorApplications[_creator];
        return (app.ipfsDocHash, app.verified, app.exists);
    }

    /// @notice Returns vote counts for a creator.
    function getVotes(address _creator)
        external
        view
        returns (uint upvotes, uint downvotes)
    {
        CreatorApplication storage app = creatorApplications[_creator];
        return (app.upvotes, app.downvotes);
    }

    /// @notice Check if an address has voted on a specific creator.
    function hasVoted(address _voter, address _creator)
        external
        view
        returns (bool)
    {
        return creatorApplications[_creator].hasVoted[_voter];
    }

    /// @notice Check how much a specific address contributed to a campaign.
    function getContribution(uint _campaignId, address _contributor)
        external
        view
        returns (uint)
    {
        return contributions[_campaignId][_contributor];
    }
}
