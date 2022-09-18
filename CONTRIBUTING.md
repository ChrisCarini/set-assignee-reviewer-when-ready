# Contributing

For general contributions, please open an issue on GitHub using one of the below templates:

- [Bug Report](https://github.com/ChrisCarini/set-assignee-reviewer-when-ready/issues/new?assignees=&labels=&template=bug_report.md&title=)
- [Feature Request](https://github.com/ChrisCarini/set-assignee-reviewer-when-ready/issues/new?assignees=&labels=&template=feature_request.md&title=)

## New Version Release Procedure

1. Navigate to
   the [GitHub Releases page for ChrisCarini/set-assignee-reviewer-when-ready](https://github.com/ChrisCarini/set-assignee-reviewer-when-ready/releases)
2. Click `Draft a new release`
3. Enter the below information
    1. Ensure `Publish this Action to the GitHub Marketplace` is selected
    2. **version tag:** we follow the format `v<version>` (ie, `v1.0.1`)
    3. **target:** Likely targeting the `main` branch, but possible a different commit.
    4. **release title:** `Release v<version>` (ie, `Release v1.0.1`)
    5. **description:** Click the `Auto-generate release notes` - it makes life easier.
4. Click `Publish Release`
5. Update the `latest` tag to the most current release:
   ```shell
   git tag -d latest && git push origin :refs/tags/latest && git tag latest main && git push origin latest
   ```
