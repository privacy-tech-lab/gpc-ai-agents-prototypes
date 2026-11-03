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

This repo holds the eight open-source prototypes from our paper:

> **[Privacy Preference Controls for Agentic Systems](https://arxiv.org/abs/2610.29929)**  
> Shreya Kochar, Peeranat Sugsavanvit, Vidur Gupta, Joseph A. Calandrino, Deepak Kumar, Brett Frischmann, Sebastian Zimmeck  
> arXiv:2610.29929, 2026

Today's privacy controls, like the [Global Privacy Control (GPC) signal](https://globalprivacycontrol.org/), were built for people who browse the web themselves. As AI agents start to act for users, those controls often do not carry over. In the paper, we ask what privacy preference controls should look like for agentic systems. We answer with a taxonomy of enforceable privacy preferences, based on privacy laws, studies of existing privacy tools, and an audit of 30 leading AI assistants and agent platforms.

The taxonomy has five areas:

| Area | What the user can limit |
| ---- | ----------------------- |
| A. Presence | Whether an agent may exist in the user's environment at all, including being added or turned on in the background |
| B. Collection | What data an agent may collect: inputs, metadata, and records of its own actions |
| C. Secondary use, repurposing, sharing, and human review | How data may be used beyond the task, such as targeting, inference, commercial use, AI training, sharing, and human review |
| D. Persistence | Whether an agent may stay after its task, start new activity on its own, or expand its scope |
| E. Autonomy | Which decisions an agent may make alone and which it must bring back to the user |

The prototypes show how parts of this taxonomy can be built into agentic protocols such as the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) and [Agent2Agent (A2A)](https://a2a-protocol.org/). Each one mirrors a real-world agent use case. Where a prototype needs a signal to carry the user's preference, we use GPC as one possible mechanism.

All prototypes run locally on [Ollama](https://ollama.com/) (default model `qwen2.5:14b`).

[1. Prototypes](#1-prototypes)  
[2. Audit Data](#2-audit-data)  
[3. Citation](#3-citation)  
[4. Contributing](#4-contributing)  
[5. Thank You!](#5-thank-you)

## 1. Prototypes

| Prototype | Folder | Use case | Taxonomy areas | What it shows |
| --------- | ------ | -------- | -------------- | ------------- |
| 1 | [prototype-1](prototype-1) | Travel planning | B1, C1b, C3 | Input collection, inference, and sharing limits via an MCP interceptor |
| 2 | [prototype-2](prototype-2) | Medical questions | C1a, C1c, C2, C3 | Targeting, commercial and analytical, repurposing, and sharing gates |
| 3 | [prototype-3](prototype-3) | Productivity tasks | A1, A2, D2, D3 | Integration, activation, initiation, and scope expansion checks for new tools |
| 4 | [prototype-4](prototype-4) | Website product research | B2a, C3 | Delegated action records, sharing, and the provider visibility gap |
| 5 | [prototype-5](prototype-5) | Web search | C1b | Profile write gate for inferred attributes |
| 6 | [prototype-6](prototype-6) | Email revision | B1, B2, C1b | Input collection, metadata collection, and inference gates |
| 7 | [prototype-7](prototype-7) | General questions with memory | B1, C1b | Retention and inference limits at session end, recall, and profile synthesis |
| 8 | [prototype-8](prototype-8) | Travel booking | A2, D2, E | Autonomy tiers, activation, and unprompted initiation with a decline-by-default fallback |

See each prototype's README for setup, run steps, and tests. The full definitions of the taxonomy codes are in the [paper](https://arxiv.org/abs/2610.29929).

## 2. Audit Data

The [audit-data](audit-data) folder has the data from the paper's audit of 30 AI products: every control and related practice we found, the page it came from, and the date we read it. Its [README](audit-data/README.md) explains the columns and how the rows add up to the counts in the paper.

## 3. Citation

If you use these prototypes, please cite the paper:

```bibtex
@misc{kochar2026privacy,
  title         = {Privacy Preference Controls for Agentic Systems},
  author        = {Kochar, Shreya and Sugsavanvit, Peeranat and Gupta, Vidur and Calandrino, Joseph A. and Kumar, Deepak and Frischmann, Brett and Zimmeck, Sebastian},
  year          = {2026},
  eprint        = {2610.29929},
  archivePrefix = {arXiv},
  url           = {https://arxiv.org/abs/2610.29929}
}
```

## 4. Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the issue template, PR conventions, and the writing rules we use across this repo.

## 5. Thank You!

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
