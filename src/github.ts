import * as github from '@actions/github';
import * as core from '@actions/core';
import { components } from '@octokit/openapi-types';

export type CheckRun = components['schemas']['check-run'];

const token = core.getInput('token', { required: true });
const client = github.getOctokit(token);

/**
 * Get the current context's PR information
 */
export function getPr(): components['schemas']['pull-request-minimal'] {
  const pullRequest = github.context.payload.workflow_run.pull_requests[0];
  if (pullRequest === undefined) {
    throw new Error(`NO PR FOUND IN CONTEXT (github.content.payload.workflow_run.pull_requests[0]):`);
  }

  return pullRequest;
}

/**
 * Request reviews on the current context's PR from the specified reviewers.
 * @param reviewers The list of reviewers to request a review.
 */
export async function requestReviewers(reviewers: string[]): Promise<void> {
  const pr = getPr().number;
  core.info(`Requesting Reviewers for PR #${pr} to: ${reviewers.join(',')}`);

  const response = await client.rest.pulls.requestReviewers({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    pull_number: pr,
    reviewers,
  });
  coreDebugJson(response, `requestReviewers(${pr}, [${reviewers.join(',')}]) > response`);
}

/**
 *
 * Assign the current context's PR to the specified assignees.
 * @param assignees The list of assignees to assign the PR.
 */
export async function setAssignees(assignees: string[]): Promise<void> {
  const pr = getPr().number;
  core.info(`Setting Assignees for PR #${pr} to: ${assignees.join(',')}`);
  const { owner, repo } = github.context.repo;

  const response = await client.rest.issues.addAssignees({
    owner,
    repo,
    issue_number: pr,
    assignees: assignees,
  });
  coreDebugJson(response, `setAssignees(${pr}, [${assignees.join(',')}]) > response`);
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
  const baseRef = getPr()?.base.ref;
  core.info(`Base Ref: ${baseRef}`);
  if (baseRef === undefined) {
    core.error(`Error getting base ref for PR #${getPr()?.number}.`);
    return undefined;
  }
  const { owner, repo } = github.context.repo;

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
