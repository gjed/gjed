<!-- pyml disable-num-lines 5 first-line-heading -->

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/readme-banner-dark.svg">
  <img alt="gjed" src=".github/readme-banner-light.svg" width="100%">
</picture>

I'm Marco Pernigo. I run release engineering, CI and observability for
[Carbonio](https://github.com/zextras) at Zextras, and I keep a homelab where I
try things before they reach work.

Most of what I build is small infrastructure tooling: GitHub managed from YAML,
OpenTelemetry exporters and Grafana dashboards. I keep
it maintained, tested and documented. When something upstream gets in the way, I
send the fix back: Grafana, the Grafana Tempo Helm chart, zot, Apache Camel and
awesome-prometheus-alerts have merged changes of mine.

## What I work on

- **Release engineering:** packaging, Jenkins pipelines and semantic-release for
  the Carbonio services at [Zextras](https://github.com/zextras).
- **Observability:**
  [github-activity-exporter](https://github.com/gjed/github-activity-exporter)
  pushes GitHub pull request, issue and Renovate dashboard metrics over OTLP;
  [jenkins-opentelemetry-dashboards](https://github.com/gjed/jenkins-opentelemetry-dashboards)
  are Grafana dashboards for the Jenkins OpenTelemetry plugin. I also added OTLP
  logs, audit events and frontend telemetry to
  [OpenArtifact](https://github.com/openartifact/openartifact).
- **GitHub as code:**
  [terraform-github-config-as-yaml](https://github.com/gjed/terraform-github-config-as-yaml)
  is a Terraform module that manages a GitHub organization from YAML;
  [github-configs-public](https://github.com/gjed/github-configs-public) manages
  my own repositories with it.
- **Homelab:** Kubernetes with k3s and Flux, Proxmox and AWS managed with
  OpenTofu, OPNsense.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="metrics/stats-dark.svg">
  <img alt="GitHub activity at a glance: contributions, an activity overview of the last 12 months, commits, pull requests, reviews, issues, stars and followers" src="metrics/stats-light.svg" width="100%">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="metrics/activity-dark.svg">
  <img alt="Contributions per year since the account was created, split into commits, pull requests with issues and code reviews, and private contributions" src="metrics/activity-light.svg" width="100%">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="metrics/languages-dark.svg">
  <img alt="Most used languages across my public repositories" src="metrics/languages-light.svg" width="100%">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="metrics/upstream-dark.svg">
  <img alt="Upstream contributions: projects outside my account where my pull requests were merged, ranked by stars" src="metrics/upstream-light.svg" width="100%">
</picture>

## Recently merged upstream

<!-- recent-prs:start -->

- [openartifact/openartifact#325](https://github.com/openartifact/openartifact/pull/325): feat(audit): stream audit events as OTLP log events · 2026-10-29
- [openartifact/openartifact#320](https://github.com/openartifact/openartifact/pull/320): feat: experimental frontend telemetry behind a same-origin relay (#222) · 2026-10-29
- [openartifact/openartifact#326](https://github.com/openartifact/openartifact/pull/326): docs(monitoring): state what OTLP log records carry and test the logs startup gate · 2026-10-28
- [openartifact/openartifact#321](https://github.com/openartifact/openartifact/pull/321): feat(telemetry): export application logs over OTLP through the otelzap bridge · 2026-10-28
- [openartifact/openartifact#304](https://github.com/openartifact/openartifact/pull/304): feat(telemetry): count dropped OTLP log records and test against a real collector · 2026-10-28
- [openartifact/helm-charts#17](https://github.com/openartifact/helm-charts/pull/17): openartifact: 0.10.0 (app 0.13.0) · 2026-10-27

<!-- recent-prs:end -->

<!-- updated:start -->

<p align="center"><sub>Cards regenerated daily by a GitHub Actions workflow · last run 2026-11-14</sub></p>

<!-- updated:end -->
