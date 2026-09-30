# VeriSkill

VeriSkill is a gas-optimized blockchain credentialing protocol designed specifically for self-taught developers in Sub-Saharan Africa (starting with Kigali, Rwanda). This project aims to bridge the gap between untappped digital talent and employment opportunities by providing a scalable, affordable, and instantly verifiable credentialing system.

## Project Description

Traditional hiring relies heavily on institutional credentials, systematically excluding self-taught developers who acquire skills through non-formal channels (bootcamps, self-study, open-source). Existing blockchain solutions are often too expensive (high gas fees) and lack robust verification mechanisms.

VeriSkill addresses these issues through a dual-platform system:

1. **Web Application (Developers):** A Next.js dashboard where developers can mint credentials, submit direct verification links (e.g., Coursera Verify URLs), and submit GitHub repositories for automated analysis.
2. **Mobile Application (Recruiters):** An Expo React Native app featuring a QR-code scanner for instant (< 2 seconds) on-site credential verification and trust score display.

### Key Features

* **Gas-Optimized Smart Contracts:** Utilizes Yul-optimized Assembly within the Ethereum Virtual Machine (EVM) to significantly reduce the gas costs of minting non-transferable Soulbound Tokens (SBTs).
* **4-Layer Verification System:**
  1. *Evidence Submission:* Direct verification links (eliminates PDF forgery).
  2. *Automated Verification:* Integration with GitHub API and GH-Repo-Analyzer for automated language, framework, and skill detection.
  3. *Peer Verification:* Community vouching.
  4. *Expert Review:* Admin panel verification.

  #### Verification Layers and Trust Levels
The system calculates a dynamic Trust Score based on the completion of the verification layers to give recruiters a clear gradient of credential reliability:

| Layer | Action | Trust Score | Recruiter Confidence |
| :--- | :--- | :--- | :--- |
| 1 | Self-Declaration | 0-10% | Low - Consider with caution |
| 2 | Direct Link Submitted (Certificate Verified) | 20-40% | Medium - Review evidence |
| 3 | GitHub Repo Scanned (Languages Detected) | 40-60% | Higher - System validated |
| 4 | Peer Verified (1-2 peers) | 60-80% | High - Community trust |
| 5 | Community Verified (3+ peers) | 80-90% | Very High - Community endorsed |
| 6 | Expert Verified | 90-100% | Highest - Expert validated |