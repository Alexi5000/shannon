<div align="center">

# Shannon - TechTide AI Fork

[![Upstream](https://img.shields.io/badge/Upstream-KeygraphHQ%2Fshannon-111827?style=flat-square&logo=github&logoColor=white)](https://github.com/KeygraphHQ/shannon)
[![License](https://img.shields.io/badge/License-AGPL_3.0-111827?style=flat-square)](LICENSE)
[![TechTide AI](https://img.shields.io/badge/TechTide_AI-0f766e?style=flat-square)](https://github.com/TechTideOhio)

</div>

---

## Why this fork exists

A fintech client's security team needed autonomous penetration testing that could prove exploits, not just flag warnings.

Their existing security scanning pipeline generated hundreds of findings per sprint. The AppSec team spent most of their time triaging false positives and writing proof-of-concept exploits for the real ones. Shannon changes the equation: it finds the vulnerability, writes the exploit, and proves it works.

This fork is TechTide's integration layer for enterprise security workflows:

1. **SARIF output** for GitHub Advanced Security and CI/CD pipeline integration
2. **Temporal startup hardening** for Windows/WSL2 and SELinux environments
3. **Custom reporting** that maps Shannon findings to client risk frameworks
4. **Docker reliability** fixes for hosts our clients actually run (RHEL, Rocky, Windows)

## What TechTide added

| Addition | Purpose |
|----------|---------|
| SARIF 2.1 report output | Integrates with GitHub Code Scanning, VS Code SARIF Viewer, and CI pipelines |
| Temporal timeout fix | Configurable startup timeout that survives Windows/WSL2 slow disk I/O |
| SELinux volume labels | `:z` relabeling on bind mounts for RHEL/Fedora/Rocky Linux hosts |
| Molten memory bridge | Custom session persistence layer for multi-run campaigns |

## Upstream

This fork tracks [KeygraphHQ/shannon](https://github.com/KeygraphHQ/shannon). All credit for Shannon's pentesting engine, Temporal orchestration, and exploit framework goes to the Keygraph team.

---

<div align="center">
  <sub>Maintained by <a href="https://github.com/Alexi5000">TechTide AI</a> for enterprise security integration.</sub>
</div>
