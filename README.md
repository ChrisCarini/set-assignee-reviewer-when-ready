# Set Assignee Reviewer when Ready

A [GitHub Action](https://help.github.com/en/actions) to set assignee(s) or reviewer(s) when a PR has finished all checks.

> Want to get notified about a PR **before** the checks have completed?
>
> _**No?**_ I don't either.

[![GitHub Marketplace](https://img.shields.io/github/v/release/ChrisCarini/set-assignee-reviewer-when-ready?label=Marketplace&logo=GitHub)](https://github.com/marketplace/actions/set-assignee-reviewer-when-ready)
[![GitHub Marketplace](https://img.shields.io/github/contributors/ChrisCarini/set-assignee-reviewer-when-ready?label=Contributors&logo=GitHub)](https://github.com/ChrisCarini/set-assignee-reviewer-when-ready/graphs/contributors)
[![GitHub Marketplace](https://img.shields.io/github/release-date/ChrisCarini/set-assignee-reviewer-when-ready?label=Last%20Release&logo=GitHub)](https://github.com/ChrisCarini/set-assignee-reviewer-when-ready/releases)

## Why?

This GitHub action was created because [Dependabot](https://docs.github.com/en/code-security/dependabot) only provides the ability to either:

- Set [assignees](https://docs.github.com/en/code-security/dependabot/dependabot-version-updates/configuration-options-for-the-dependabot.yml-file#assignees) and/or [reviewers](https://docs.github.com/en/code-security/dependabot/dependabot-version-updates/configuration-options-for-the-dependabot.yml-file#reviewers) upon Dependabot PR creation.
- Not set assignees or reviewers on Dependabot PRs.

I have my repos configured to auto-merge Dependabot PRs once all required checks have passed. I really **only** want to get requested to review a PR (or, assigned a PR) if one of the required checks ends in an 'unacceptable' state (ie, it failed, or timed out). As such, this GitHub Action was created to enable me to be notified (via being requested for reviews) when a required check has failed. I implemented this GitHub Action with various configuration options to allow for flexibility in configuration; see the [options section](#-options) for details.

# Usage

Add the action to your [GitHub Action Workflow file](https://help.github.com/en/actions/configuring-and-managing-workflows/configuring-a-workflow#creating-a-workflow-file) - the only thing you _need_ to specify are the JetBrains products & versions you wish to run against.

A minimal example of a workflow step is below:

```yaml
    - name: Set Assignee and Reviewer when Checks Ready
      uses: ChrisCarini/set-assignee-reviewer-when-ready@latest
      with:
        assignees: 'ChrisCarini'
        reviewers: 'ChrisCarini'
        token: ${{ secrets.REPO_SCOPE_GITHUB_TOKEN }}
```

## 🔧 Installation

1) Create a `.yml` (or `.yaml`) file in your GitHub repository's `.github/workflows` folder. We will call this file `set-assignee-reviewer-when-pr-checks-ready.yml` below.
1) Copy the below contents into `set-assignee-reviewer-when-pr-checks-ready.yml`
    ```yaml
    name: 'Set Assignee Reviewer on PR when Checks Ready'
    on:
     workflow_run:
       workflows:
         - <ENTER_YOUR_WORKFLOW_NAMES_HERE>
       types:
         - completed

    jobs:
      set_assignee_reviewers:
        name: "Set Assignee and Reviewer when Checks Ready"
        runs-on: ubuntu-latest
        steps:
          - name: Set Assignee and Reviewer when Checks Ready
            uses: ChrisCarini/set-assignee-reviewer-when-ready@latest
            with:
              assignees: 'ChrisCarini'
              reviewers: 'ChrisCarini'
              waitSeconds: 30
              token: ${{ secrets.REPO_SCOPE_GITHUB_TOKEN }}
    ```

## ⚙️ Options

This GitHub Action exposes several input options.

### Option Table

|            Input            | Description                                                                                                                 |     Usage      |                Default                 |
|:---------------------------:|:----------------------------------------------------------------------------------------------------------------------------|:--------------:|:--------------------------------------:|
|            `token`          | The GitHub token to use for making API requests.                                                                            |   *Required*   |                  N/A                   |
|    `acceptableConclusions`  | The acceptable conclusion for each check run that has completed. Defaults to all known conclusions.                         |   *Optional*   | `success, neutral, cancelled, skipped` |
|   `unacceptableConclusions` | The unacceptable conclusion for each check run that has completed. Defaults to no unacceptable conclusions.                 |   *Optional*   | `failure, timed_out, action_required`  |
|          `assignees`        | List of assignees to assign the PR to. Defaults to no one.                                                                  | *Required* (*) |                _No One_                |
|          `reviewers`        | List of reviewers to request reviews on the PR. Defaults to no one.                                                         | *Required* (*) |                _No One_                |
|     `requiredChecksOnly`    | Only consider `required checks`. Defaults to true.                                                                          |   *Optional*   |                 `true`                 |
|         `waitSeconds`       | If all checks having acceptable conclusions, wait N seconds before requesting reviewers on the PR. Defaults to 10 minutes.  |   *Optional*   |                 `600`                  |

`(*)` = You can set one (ie, either `assignees` or `reviewers`), or both of these inputs. Setting neither of these inputs doesn't do anything.

### Example using all options

An example using all the available options is below:

```yaml
    - name: Set Assignee and Reviewer when Checks Ready
      uses: ChrisCarini/set-assignee-reviewer-when-ready@latest
      with:
        acceptableConclusions: 'success'    # The only 'acceptable conclusion' to a check run is `success`.
        unacceptableConclusions: 'failure'  # The only 'unacceptable conclusion' to a check run is `failure`. 
        assignees: 'ChrisCarini'            # Assign the PR to `ChrisCarini`
        reviewers: 'ChrisCarini, scalvert'  # Add `ChrisCarini` & `scalvert` as reviewers of the PR
        requiredChecksOnly: 'false'         # This will cause *all* checks on a PR to need to be 'acceptable' for assignment & requesting review to work.
        waitSeconds: '300'                  # Wait 5 minutes after all acceptable check runs have completed before assigning / requesting reviews.
        token: ${{ secrets.REPO_SCOPE_GITHUB_TOKEN }}
```

### `token`

A GitHub token is required for this action in order to make various API calls.

By default, this GitHub action requires a [Personal Access Token (PAT)](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token) with the `repo` scope. This is because the API call to get "Status Checks Protection" requires the `repo` scope in order to function properly.

If you want to set [the `requiredChecksOnly` option](#requiredchecksonly) to `false`, you can use the [automatically created `GITHUB_TOKEN` provided by GitHub Actions Workflows](https://docs.github.com/en/actions/security-guides/automatic-token-authentication#using-the-github_token-in-a-workflow).

### `acceptableConclusions`

This optional input allows the user to specify the check run 'conclusions' they want to indicate as 'acceptable'. See the [Conclusions](#conclusions) section below.

**Default Values:** `'success, neutral, cancelled, skipped'`

To be 'acceptable' means that the PR will **_NOT_** be assigned / review requested, **UNLESS** the [`waitSeconds`](#waitseconds) option is also configured.

### `unacceptableConclusions`

This optional input allows the user to specify the check run 'conclusions' they want to indicate as 'unacceptable'. See the [Conclusions](#conclusions) section below.

**Default Values:** `'failure, timed_out, action_required'`

To be 'unacceptable' means that the PR will immediately be assigned / review requested.

### `assignees`

This 'optional' input allows the user to set the GitHub username(s) to assign a PR. If multiple usernames are desired, separate them by commas (eg. `user1, user2, user3`).

_**Note:** This is 'optional', but if you set **neither** `assignees` nor `reviewers`, this action does not do anything._

### `reviewers`

This 'optional' input allows the user to set the GitHub username(s) to request reviews from on the PR. If multiple usernames are desired, separate them by commas (eg. `user1, user2, user3`).

_**Note:** This is 'optional', but if you set **neither** `assignees` nor `reviewers`, this action does not do anything._

### `requiredChecksOnly`

This optional input allows the user to mark if they want **all** checks, or **only required** checks on a PR to have an ['acceptable conclusion'](#acceptableconclusions).

| **Setting** | **Default?** | **Description**                                                                                            |
|:-----------:|:------------:|:-----------------------------------------------------------------------------------------------------------|
|   `true`    |      ✅       | **Only required** checks on a PR to complete and have an ['acceptable conclusion'](#acceptableconclusions) |
|   `false`   |      ❌       | **ALL** checks on a PR to complete **_and_** have an ['acceptable conclusion'](#acceptableconclusions)     |

### `waitSeconds`

This optional input allows the user to both:

1) Specify they want the PR assigned / review requested **even if** all check runs have ['acceptable conclusions'](#acceptableconclusions).
2) Specify how long to wait, in seconds, before the PR is assigned / review requested.

That is to say, that if this option is set, any check runs with ['acceptable conclusions'](#acceptableconclusions) will have assignees/reviewers set as configured.

The second item ("how long to wait") is intended provide 'buffer time', allowing any bots / workflows / apps that are configured to auto-merge PRs once all checks have completed.

If you want any check runs with ['acceptable conclusions'](#acceptableconclusions) to have assignees/reviewers set as configured **right away**, set this value to something small (ie, `0`).

## Conclusions

GitHub Actions can have several different 'conclusions' for each check run once they are complete.

Below are the 'conclusions':

- action_required
- cancelled
- failure
- neutral
- skipped
- success
- timed_out

For the most up-to-date list, search 'conclusion' on the [GitHub REST API Docs page for 'Checks / Check Runs'](https://docs.github.com/en/rest/checks/runs#create-a-check-run).

# Examples

As examples of using this plugin you can check out following projects:

- **_TODO_**

# 🤝 Contributing

Contributions welcomed! Feel free to open a PR, or issue.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for more details.

# 👷 🚧 Developer Notes 🚧 👷

## Developer Quick Start

⚠️ _**NOTE:** This section is intended for developers in this repository._

### Install dependencies

```shell
npm install
```

### Build the typescript source & package for distribution

```shell
npm run build && npm run package
```

### Run tests

```shell
npm test
```

## Manual Integration Testing Notes

When authoring this GitHub Action, I performed the below tests manually. Why manually? Because I had to manually configure the repo branch protection rules to require different types of checks. This could possibly be automated some day, but not today.

- **✅ 2022-09-10 - passed**: both required checks (both expected to succeed) in **single** workflow file
- **✅ 2022-09-10 - passed**: both required checks (one expected to succeed; the other fail) in **split** workflow files
- **✅ 2022-09-10 - passed**: both required checks (one expected to succeed; the other fail) in **single** workflow file
- **✅ 2022-09-10 - passed**: both required checks (both expected to succeed) in **split** workflow files

## Debugging

This action has [GitHub Actions Debug Logging](https://help.github.com/en/actions/configuring-and-managing-workflows/managing-a-workflow-run#enabling-step-debug-logging).

To enable, set the following secret in the repository that contains the workflow using this action to `true`.

- `ACTIONS_STEP_DEBUG`

You can find this under the repositories `Settings -> Secrets` menu.
