import * as github from '@actions/github';
import * as core from '@actions/core';
import { components } from '@octokit/openapi-types';

export type CheckRun = components['schemas']['check-run'];
type MinimalPR = components['schemas']['pull-request-minimal'];

const token = core.getInput('token', { required: true });
export const client = github.getOctokit(token);

/**
 * Cache for PR.
 */
let prNumber: MinimalPR | null = null;

/**
 * Get the current context's PR information
 */
export async function getPr(): Promise<MinimalPR> {
  if (prNumber === null) {
    core.debug('PR Number not yet set; fetching...');
    prNumber = await fetchPr();
  } else {
    core.debug(`PR Number already set; reusing PR #${prNumber}.`);
  }
  return prNumber;
}

/**
 * Fetch PR information; extracted as this can yield an API call.
 */
async function fetchPr(): Promise<MinimalPR> {
  const pullRequest = github.context.payload.workflow_run.pull_requests[0];
  if (pullRequest !== undefined) {
    core.debug(`github.context.payload.workflow_run.pull_requests[0] !== undefined : Using PR #${pullRequest}.`);
    return pullRequest;
  }

  // It is possible that the `workflow_run` object has an empty `pull_requests` array.
  // So, we need to go hunting for the associated pull request based on the display title
  // of the workflow_run. Grab the most recently updated PRs, and search for a matching
  // PR title.
  const workflowRunDisplayTitle = github.context.payload.workflow_run.display_title;
  const { owner, repo } = github.context.repo;
  const { data: pulls } = await client.rest.pulls.list({
    owner,
    repo,
    state: 'all',
    sort: 'updated',
    direction: 'desc',
  });
  const pullRequests = pulls.filter((pull) => pull.title == workflowRunDisplayTitle);
  coreDebugJson(pullRequests, 'fetchPr() > pullRequests');
  if (pullRequests !== undefined && pullRequests.length >= 1) {
    return pullRequests[0];
  }

  throw new Error(
    `NO PR FOUND (Searched in 'github.content.payload.workflow_run.pull_requests[0]' and searched for title: ${workflowRunDisplayTitle})`
  );
}

/**
 * Request reviews on the current context's PR from the specified reviewers.
 * @param reviewers The list of reviewers to request a review.
 */
export async function requestReviewers(reviewers: string[]): Promise<void> {
  const pr = (await getPr()).number;
  core.info(`Requesting Reviewers for PR #${pr} to: ${reviewers.join(',')}`);
  const { owner, repo } = github.context.repo;
  try {
    const response = await client.rest.pulls.requestReviewers({
      owner,
      repo,
      pull_number: pr,
      reviewers,
    });
    coreDebugJson(response, `requestReviewers(${pr}, [${reviewers.join(',')}]) > response`);
  } catch (error: any) {
    core.warning(`Error requesting reviewer(s) on PR #${pr} to: [${reviewers.join(',')}]`);
    core.warning(error.message);
  }
}

/**
 *
 * Assign the current context's PR to the specified assignees.
 * @param assignees The list of assignees to assign the PR.
 */
export async function setAssignees(assignees: string[]): Promise<void> {
  const pr = (await getPr()).number;
  core.info(`Setting Assignees for PR #${pr} to: ${assignees.join(',')}`);
  const { owner, repo } = github.context.repo;
  try {
    const response = await client.rest.issues.addAssignees({
      owner,
      repo,
      issue_number: pr,
      assignees,
    });
    coreDebugJson(response, `setAssignees(${pr}, [${assignees.join(',')}]) > response`);
  } catch (error: any) {
    core.warning(`Error assigning PR #${pr} to: [${assignees.join(',')}]`);
    core.warning(error.message);
  }
}

/**
 * Check if the provided pull request is still open.
 * @param pr The PR number to check.
 */
export async function isPrOpen(pr: number): Promise<boolean> {
  const { owner, repo } = github.context.repo;
  const { data: pullRequest } = await client.rest.pulls.get({
    owner,
    repo,
    pull_number: pr,
  });
  return pullRequest.state === 'open';
}

/**
 * Get the checkruns for the current context's workflow_run for the head SHA.
 */
export async function getCheckRuns(): Promise<CheckRun[]> {
  const ref = github.context.payload.workflow_run.head_sha;
  const { owner, repo } = github.context.repo;

  core.info(`Retrieving check runs for ${owner}/${repo}@${ref}...`);
  const checkRuns: CheckRun[] = (
    await client.rest.checks.listForRef({
      owner,
      repo,
      ref,
    })
  ).data.check_runs;

  core.info(`Retrieved ${checkRuns.length} check runs.`);
  coreDebugJson(checkRuns, 'getCheckRuns() > checkRuns');

  return checkRuns;
}

/**
 * Get the required checks for the base ref.
 */
export async function getRequiredCheckNames(): Promise<string[] | undefined> {
  const baseRef = (await getPr())?.base.ref;
  core.info(`Base Ref: ${baseRef}`);
  if (baseRef === undefined) {
    core.error(`Error getting base ref for PR #${(await getPr())?.number}.`);
    return undefined;
  }
  const { owner, repo } = github.context.repo;

  try {
    core.info(`Retrieving branch protection information for ${owner}/${repo}@${baseRef}...`);
    const result: components['schemas']['status-check-policy'] = (
      await client.rest.repos.getStatusChecksProtection({
        owner,
        repo,
        branch: baseRef,
      })
    ).data;

    coreDebugJson(result, 'getRequiredChecks() > result');
    return result?.contexts;
  } catch (error: any) {
    core.warning(error.message);
    core.warning('Proceeding assuming there are no required checks.');
    return undefined;
  }
}

/**
 * Get user inputs as an array (expects the user input to be CSV)
 * @param name The name of the user input
 * @param defaultVal The default value
 */
export function getInputArray(name: string, defaultVal: string[]): string[] {
  return (
    core
      .getInput(name)
      .split(',')
      .map((i) => i.trim()) || defaultVal
  );
}

/**
 * Get user inputs
 * @param name The name of the user input
 * @param defaultValue The default value
 */
export function getInputWithDefault(name: string, defaultValue: string): string {
  return core.getInput(name) || defaultValue;
}

// TODO - Checking w/ Steve; this might be better to replace the above 2 methods.
// export function smarterGetInputWithDefault<Type extends string | string[]>(name: string, defaultValue: Type): Type {
//   const input = core.getInput(name);
//   if (Array.isArray(defaultValue)) {
//     return (input.split(',').map((i) => i.trim()) || defaultValue) as Type;
//   }
//   return (input || defaultValue) as Type;
// }

/**
 * Helper to pretty-print JSON as log debug.
 * @param value The object to pretty-print
 * @param name The name (used for header/footer)
 */
export function coreDebugJson(value: object, name: string) {
  core.debug(`====== BEGIN ${name} ======`);
  core.debug(JSON.stringify(value, null, 4));
  core.debug(`======= END ${name} =======`);
}
