<p align="center">
  <a href="https://github.com/privacy-tech-lab/gpc-ai-agents-prototypes/releases"><img alt="GitHub release (latest by date)" src="https://img.shields.io/github/v/release/privacy-tech-lab/gpc-ai-agents-prototypes"></a>
  <a href="https://github.com/privacy-tech-lab/gpc-ai-agents-prototypes/releases"><img alt="GitHub Release Date" src="https://img.shields.io/github/release-date/privacy-tech-lab/gpc-ai-agents-prototypes"></a>
  <a href="https://github.com/privacy-tech-lab/gpc-ai-agents-prototypes/commits/main"><img alt="GitHub last commit" src="https://img.shields.io/github/last-commit/privacy-tech-lab/gpc-ai-agents-prototypes"></a>
  <a href="https://github.com/privacy-tech-lab/gpc-ai-agents-prototypes/issues"><img alt="GitHub issues" src="https://img.shields.io/github/issues-raw/privacy-tech-lab/gpc-ai-agents-prototypes"></a>
  <a href="https://github.com/privacy-tech-lab/gpc-ai-agents-prototypes/issues?q=is%3Aissue+is%3Aclosed"><img alt="GitHub closed issues" src="https://img.shields.io/github/issues-closed-raw/privacy-tech-lab/gpc-ai-agents-prototypes"></a>
  <a href="https://github.com/privacy-tech-lab/gpc-ai-agents-prototypes/blob/main/LICENSE.md"><img alt="GitHub" src="https://img.shields.io/github/license/privacy-tech-lab/gpc-ai-agents-prototypes"></a>
  <a href="https://github.com/privacy-tech-lab/gpc-ai-agents-prototypes/watchers"><img alt="GitHub watchers" src="https://img.shields.io/github/watchers/privacy-tech-lab/gpc-ai-agents-prototypes?style=social"></a>
  <a href="https://github.com/privacy-tech-lab/gpc-ai-agents-prototypes/stargazers"><img alt="GitHub Repo stars" src="https://img.shields.io/github/stars/privacy-tech-lab/gpc-ai-agents-prototypes?style=social"></a>
  <a href="https://github.com/privacy-tech-lab/gpc-ai-agents-prototypes/network/members"><img alt="GitHub forks" src="https://img.shields.io/github/forks/privacy-tech-lab/gpc-ai-agents-prototypes?style=social"></a>
  <a href="https://github.com/sponsors/privacy-tech-lab"><img alt="GitHub sponsors" src="https://img.shields.io/static/v1?label=Sponsor&message=%E2%9D%A4&logo=GitHub&color=%23fe8e86"></a>
</p>

# GPC AI Agents Prototypes

The GPC AI Agent Prototypes are developed and maintained by the [OptMeowt team](https://github.com/privacy-tech-lab/gpc-optmeowt#optmeowt-).

This repo contains experimental prototypes exploring how the [Global Privacy Control (GPC) signal](https://globalprivacycontrol.org/) propagates and is enforced across multi-agent AI pipelines. Each prototype simulates a realistic agentic workflow and tests a specific question: does the user's privacy preference actually stop data from being shared, or does it only carry the signal forward and leave enforcement to whoever is downstream?

[1. Prototypes](#1-prototypes)  
[2. Contributing](#2-contributing)  
[3. Thank You!](#3-thank-you)

## 1. Prototypes

| Prototype | Folder                     | What it shows                                                       |
| --------- | -------------------------- | ------------------------------------------------------------------- |
| 1         | [prototype-1](prototype-1) | Tool-level blocking via an MCP interceptor                          |
| 2         | [prototype-2](prototype-2) | Purpose-based gating of secondary pipelines after the agent answers |
| 3         | [prototype-3](prototype-3) | Per-call consent checks for tools added after signup                |
| 4         | [prototype-4](prototype-4) | Signal propagation and the provider visibility gap                  |
| 5         | [prototype-5](prototype-5) | Inference firewall for derived attributes                           |
| 6         | [prototype-6](prototype-6) | Collection gates for input, behavior, and derived data              |
| 7         | [prototype-7](prototype-7) | Retention limits at session end, recall, and profile synthesis      |
| 8         | [prototype-8](prototype-8) | Delegation tiers with a decline-by-default fallback                 |

## 2. Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the issue template, PR conventions, and the writing rules we use across this repo.

## 3. Thank You!

<p align="center"><strong>We would like to thank our supporters!</strong></p><br>

<p align="center">Major financial support provided by the National Science Foundation under awards <a href="https://nsf.gov/awardsearch/showAward?AWD_ID=2055196">#2055196</a> and <a href="https://www.nsf.gov/awardsearch/show-award/?AWD_ID=2618248">#2618248</a>.</p>

<p align="center">
   <img class="img-fluid" src="./nsf.png" height="100px" alt="National Science Foundation Logo">
</p>

<p align="center">Additional financial support provided by Wesleyan University and the Anil Fernando Endowment.</p>

<p align="center">
  <a href="https://www.wesleyan.edu/mathcs/cs/index.html">
    <img class="img-fluid" src="./wesleyan_shield.png" height="70px" alt="Wesleyan University Logo">
  </a>
</p>

<p align="center">Conclusions reached or positions taken are our own and not necessarily those of our financial supporters, its trustees, officers, or staff.</p>

##

<p align="center">
  <a href="https://privacytechlab.org/"><img src="./plt_logo.png" width="200px" height="200px" alt="privacy-tech-lab logo"></a>
<p>
