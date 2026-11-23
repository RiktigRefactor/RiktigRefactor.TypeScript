---
name: continuous-integration
description: Use whenever setting up a source project, adding or editing CI (e.g. GitHub Actions workflows or other pipelines), or noticing that a source project has no CI. Every source project should have CI.
---

# Continuous Integration

Every source project should have CI.
A "source project" is any repo with code to build or test.

If a source project has no CI, point out that it's missing.

## What CI runs

CI runs the same build-and-test script that developers run locally (see the developer-experience skill). Keep the CI configuration thin. Put any real logic in the script, not in the CI configuration, so it can be run and debugged locally.

## When it runs

- On every push.
- On every pull request.
- On user trigger (workflow_dispatch)
- On a schedule (e.g., nightly) to catch external/environmental issues.
    - Avoid peak times

## Where it runs

- Use the CI system built into the repo's host (e.g. GitHub Actions for a GitHub repo).
- CI starts from a clean machine, so it checks the developer-experience goal that a fresh clone builds and tests with no extra setup.
    - Where appropriate, use `ubuntu-slim` and let our configuration handle installing any additional dependencies.
- If CI needs a setup step that a developer wouldn't, ask whether build-and-test should handle it instead.
- If the project is meant to work on more than one OS, run CI on each of them.

## Other workflows

- Run formatting and mdsnippets and commit
- Release
- Check markdown links:
    ```yaml
    - uses: tcort/github-action-markdown-link-check@e7c7a18363c842693fadde5d41a3bd3573a7a225 # v1.1.2
      with:
        use-quiet-mode: 'yes'
        config-file: 'mlc_config.json'
    ```
    with configuration in `mlc_config.json` at the repo root:
    ```json
    {
      "ignorePatterns": [
        {
          "pattern": "^/"
        }
      ]
    }
    ```
