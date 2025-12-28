import * as github from '@actions/github';
import * as core from '@actions/core';

export type OctokitClient = ReturnType<typeof github.getOctokit>;

const token: string = core.getInput('token', { required: true });
export const client: OctokitClient = github.getOctokit(token);

type CheckRunsRequestResponse = Awaited<
  ReturnType<typeof client.request<'GET /repos/{owner}/{repo}/commits/{ref}/check-runs'>>
>;
export type CheckRun = CheckRunsRequestResponse['data']['check_runs'][number];

type PullsListResponse = Awaited<ReturnType<OctokitClient['rest']['pulls']['list']>>;
type PullRequestFromList = PullsListResponse['data'][number];

type StatusChecksProtectionResponse = Awaited<ReturnType<OctokitClient['rest']['repos']['getStatusChecksProtection']>>;
type StatusCheckPolicy = StatusChecksProtectionResponse['data'];

export type CheckConclusion = NonNullable<CheckRun['conclusion']>;
interface WorkflowRunPayload {
  pull_requests: PullRequestFromList[];
  display_title: string;
  head_sha: string;
}

/**
 * Cache for PR.
 */
let prNumber: PullRequestFromList | null = null;

/**
 * Get the current context's PR information.
 * Caches the result to avoid repeated API calls.
 * @returns The pull request representation
 */
export async function getPr(): Promise<PullRequestFromList> {
  if (prNumber === null) {
    core.debug('PR Number not yet set; fetching...');
    prNumber = await fetchPr();
  } else {
    core.debug(`PR Number already set; reusing PR #${prNumber.number}.`);
  }
  return prNumber;
}

/**
 * Fetch PR information from the workflow_run payload or via API lookup.
 * @returns The pull request representation
 * @throws Error if no PR can be found
 */
async function fetchPr(): Promise<PullRequestFromList> {
  const workflowRun = github.context.payload.workflow_run as WorkflowRunPayload;
  const pullRequest: PullRequestFromList | undefined = workflowRun.pull_requests[0];

  if (pullRequest !== undefined) {
    core.debug(`Found PR in workflow_run.pull_requests: PR #${pullRequest.number}`);
    return pullRequest;
  }

  // It is possible that the `workflow_run` object has an empty `pull_requests` array.
  // So, we need to go hunting for the associated pull request based on the display title
  // of the workflow_run. Grab the most recently updated PRs, and search for a matching
  // PR title.
  const workflowRunDisplayTitle: string = workflowRun.display_title;
  const { owner, repo } = github.context.repo;
  const { data: pulls } = await client.rest.pulls.list({
    owner,
    repo,
    state: 'all',
    sort: 'updated',
    direction: 'desc',
  });
  const pullRequests = pulls.filter((pull): boolean => pull.title === workflowRunDisplayTitle);
  coreDebugJson(pullRequests, 'fetchPr() > pullRequests');
  if (pullRequests !== undefined && pullRequests.length >= 1) {
    return pullRequests[0];
  }

  throw new Error(
    `NO PR FOUND (Searched in 'github.context.payload.workflow_run.pull_requests[0]' and searched for title: ${workflowRunDisplayTitle})`
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
  } catch (error: unknown) {
    if (error instanceof Error) {
      core.warning(`[${error.message}] Error requesting reviewer(s) on PR #${pr} to: [${reviewers.join(',')}]`);
    } else {
      core.warning(`Error requesting reviewer(s) on PR #${pr} to: [${reviewers.join(',')}] -- ${error}`);
    }
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
  } catch (error: unknown) {
    if (error instanceof Error) {
      core.warning(`[${error.message}] Error assigning PR #${pr} to: [${assignees.join(',')}]`);
    } else {
      core.warning(`Error assigning PR #${pr} to: [${assignees.join(',')}] -- ${error}`);
    }
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
 * Get the check runs for the current context's workflow_run for the head SHA.
 * @returns Array of check runs for the commit
 */
export async function getCheckRuns(): Promise<CheckRun[]> {
  const workflowRun = github.context.payload.workflow_run as WorkflowRunPayload;
  const ref: string = workflowRun.head_sha;
  const { owner, repo } = github.context.repo;

  core.info(`Retrieving check runs for ${owner}/${repo}@${ref}...`);
  const checkRuns: CheckRun[] = // We use the `client.request` because `client.rest.checks.listForRef` apparently returns the wrong type (nested CheckRun > app > owner). Ugh.. huh?
    //Using request directly gives us proper typing.
    // await client.rest.checks.listForRef({
    (
      await client.request('GET /repos/{owner}/{repo}/commits/{ref}/check-runs', {
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
 * Get the required check names for the base ref from branch protection settings.
 * @returns Array of required check names, or undefined if unavailable
 */
export async function getRequiredCheckNames(): Promise<readonly string[] | undefined> {
  const pr = await getPr();
  const baseRef: string | undefined = pr?.base.ref;
  core.info(`Base Ref: ${baseRef}`);
  if (baseRef === undefined) {
    core.error(`Error getting base ref for PR #${pr?.number}.`);
    return undefined;
  }
  const { owner, repo } = github.context.repo;

  try {
    core.info(`Retrieving branch protection information for ${owner}/${repo}@${baseRef}...`);
    const { data: result }: { data: StatusCheckPolicy } = await client.rest.repos.getStatusChecksProtection({
      owner,
      repo,
      branch: baseRef,
    });

    coreDebugJson(result, 'getRequiredCheckNames() > result');
    return result?.contexts;
  } catch (error: unknown) {
    if (error instanceof Error) {
      core.warning(`[${error.message}] Proceeding assuming there are no required checks.`);
    } else {
      core.warning(`Error getting required checks for ${owner}/${repo}@${baseRef} -- ${error}`);
    }
    return undefined;
  }
}

/**
 * Get user inputs as an array (expects the user input to be CSV).
 * @param name The name of the user input
 * @param defaultVal The default value if input is empty
 * @returns Array of trimmed string values
 */
export function getInputArray(name: string, defaultVal: readonly string[]): string[] {
  const input = core.getInput(name);
  if (!input || input.trim() === '') {
    return [...defaultVal];
  }
  return input
    .split(',')
    .map((item: string): string => item.trim())
    .filter((item: string): boolean => item !== '');
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
export function coreDebugJson(value: object, name: string): void {
  core.debug(`====== BEGIN ${name} ======`);
  core.debug(JSON.stringify(value, null, 4));
  core.debug(`======= END ${name} =======`);
}
