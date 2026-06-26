# Security Policy

## Reporting

Do not open public issues containing credentials, customer data, packet captures,
or live flow exports.

For security-sensitive reports, contact Forward Networks through your normal
Forward support or account channel.

## Secrets

This repository must not contain Kentik tokens, Forward credentials, `.env`
files, live customer exports, or tenant-specific reports.

Use environment variables or local ignored files for credentials. Review
generated artifacts before sharing them outside the customer environment.

## Supported Use

This project is a Forward field integration and reference implementation. It is
not an officially supported Forward product integration.
