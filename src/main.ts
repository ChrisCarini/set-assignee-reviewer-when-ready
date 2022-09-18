import * as core from '@actions/core';
import * as github from '@actions/github';
import { wait } from './wait';
import {
  CheckRun,
  coreDebugJson,
  getCheckRuns,
  getInputArray,
  getInputWithDefault,
  getPr,
  getRequiredCheckNames,
  requestReviewers,
  setAssignees,
} from './github';

const ALL_VALID_CHECK_CONCLUSIONS = [
  'success',
  'failure',
  'neutral',
  'cancelled',
  'skipped',
  'timed_out',
  'action_required',
];

type UserInputs = {
  acceptableConclusions: string[];
  unacceptableConclusions: string[];
  assignees: string[];
  reviewers: string[];
  requiredChecksOnly: boolean;
  delayBeforeRequestingReviews: number;
  check: string;
};

/**
 * Gather all the inputs from the user workflow file.
 */
async function gatherInputs(): Promise<UserInputs> {
  core.startGroup('Gathering inputs...');
  coreDebugJson(github.context, 'github.context');

  const pr = await getPr();
  core.info(`PR #: ${pr.number}`);

  const acceptableConclusions = getInputArray('acceptableConclusions', ALL_VALID_CHECK_CONCLUSIONS);
  const unacceptableConclusions = getInputArray('unacceptableConclusions', []);
  const assignees = getInputArray('assignees', []);
  const reviewers = getInputArray('reviewers', []);
  const requiredChecksOnly = getInputWithDefault('requiredChecksOnly', 'true') === 'true';
  const delayBeforeRequestingReviews = parseInt(getInputWithDefault('delayBeforeRequestingReviews', '0'));
  const check = requiredChecksOnly ? 'required check' : 'check';

  core.debug('Inputs:');
  core.debug('=======');
  core.debug(`acceptableConclusions:        ${acceptableConclusions}`);
  core.debug(`unacceptableConclusions:      ${unacceptableConclusions}`);
  core.debug(`assignees:                    ${assignees}`);
  core.debug(`reviewers:                    ${reviewers}`);
  core.debug(`requiredChecksOnly:           ${requiredChecksOnly}`);
  core.debug(`delayBeforeRequestingReviews: ${delayBeforeRequestingReviews}`);
  core.debug('');
  core.endGroup(); // Gathering inputs...
  return {
    acceptableConclusions,
    unacceptableConclusions,
    assignees,
    reviewers,
    requiredChecksOnly,
    delayBeforeRequestingReviews,
    check,
  };
}

async function getChecksToCheck(requiredChecksOnly: boolean, check: string): Promise<CheckRun[]> {
  core.startGroup(`Getting ${check} to check...`);
  const allCheckRuns = await getCheckRuns();

  // Call getRequiredCheckNames() outside the filter so we only make a single API call.
  const requiredCheckNames = requiredChecksOnly ? await getRequiredCheckNames() : undefined;
  const checksToCheck = requiredChecksOnly
    ? allCheckRuns.filter(
        // If requiredCheckNames is undefined, that means either (1) we could not get the baseRef, or
        // (2) the particular branch has no required checks.
        (checkRun) => requiredCheckNames === undefined || requiredCheckNames.includes(checkRun.name)
      )
    : allCheckRuns;

  core.info(`${check}s to check:`);
  core.info(`${'='.repeat(check.length + 16)}`);
  checksToCheck.forEach((checkRun, index) => {
    const idx = String(index).padStart(2, ' ');
    const status = checkRun.status.padStart(12, ' ');
    const conclusion = checkRun.conclusion?.padStart(16, ' ');
    core.info(`    - #${idx}) [${status} | ${conclusion}] -> ${checkRun.name} `);
  });
  core.endGroup(); // `Getting ${check} to check...`
  return checksToCheck;
}

async function computeCheckRunStatus(
  check: string,
  checksToCheck: CheckRun[],
  acceptableConclusions: string[],
  unacceptableConclusions: string[]
): Promise<{ acceptable: boolean; unacceptable: boolean }> {
  core.startGroup(`Computing ${check} run status...`);

  const completedChecksToCheck = checksToCheck.filter((checkRun) => checkRun.status === 'completed');

  core.info(`Found ${completedChecksToCheck.length} completed ${check}s`);

  const allCompleted = checksToCheck.length == completedChecksToCheck.length;
  if (!allCompleted) {
    core.warning(`All ${check} runs have *NOT* completed. Exiting.`);
    process.exit(0);
  }

  core.info(`All ${check} runs have completed.`);

  const acceptableConclusionChecks = completedChecksToCheck.filter((checkRun) => {
    return acceptableConclusions.includes(checkRun.conclusion || '');
  });
  const unacceptableConclusionChecks = completedChecksToCheck.filter((checkRun) => {
    return unacceptableConclusions.includes(checkRun.conclusion || '');
  });

  core.debug(`acceptableConclusionChecks:   ${acceptableConclusionChecks.map((cr) => cr.name)}`);
  core.debug(`unacceptableConclusionChecks: ${unacceptableConclusionChecks.map((cr) => cr.name)}`);

  const acceptable = completedChecksToCheck.length == acceptableConclusionChecks.length;
  const unacceptable = unacceptableConclusionChecks.length > 0;

  core.info(`All ${check}s are Acceptable:   ${acceptable}`);
  core.info(`Any ${check}s are Unacceptable: ${unacceptable}`);
  core.endGroup(); // `Computing Check Run Status for PR #${pr.number}...`
  return { acceptable, unacceptable };
}

async function takeAction(
  isAcceptable: boolean,
  delayBeforeRequestingReviews: number,
  check: string,
  assignees: string[],
  reviewers: string[],
  isUnacceptable: boolean
) {
  core.startGroup(`Taking action on PR #${(await getPr()).number}`);
  if (isAcceptable && delayBeforeRequestingReviews) {
    // All checks have passed
    core.info(`All ${check} runs have acceptable conclusions. Waiting for ${delayBeforeRequestingReviews} seconds...`);
    await wait(delayBeforeRequestingReviews * 1000);
    core.info(`Finished waiting for ${delayBeforeRequestingReviews} seconds.`);
    await assignAndRequestReviewers(assignees, reviewers);
  } else if (isUnacceptable) {
    core.info(`Some ${check} runs have unacceptable conclusions.`);
    await assignAndRequestReviewers(assignees, reviewers);
  } else {
    core.info(`Nothing to do.`);
  }
  core.endGroup(); // `Taking action on PR #${pr.number}`
}

async function assignAndRequestReviewers(assignees: string[], reviewers: string[]): Promise<void> {
  if (assignees.length > 0) {
    await setAssignees(assignees);
  } else {
    core.info('Assignees not set. Skipping PR assignment...');
  }
  if (reviewers.length > 0) {
    await requestReviewers(reviewers);
  } else {
    core.info('Reviewers not set. Skipping requesting review...');
  }
}

async function run(): Promise<void> {
  try {
    const {
      acceptableConclusions,
      unacceptableConclusions,
      assignees,
      reviewers,
      requiredChecksOnly,
      delayBeforeRequestingReviews,
      check,
    } = await gatherInputs();

    const checksToCheck = await getChecksToCheck(requiredChecksOnly, check);

    const { acceptable, unacceptable } = await computeCheckRunStatus(
      check,
      checksToCheck,
      acceptableConclusions,
      unacceptableConclusions
    );

    await takeAction(acceptable, delayBeforeRequestingReviews, check, assignees, reviewers, unacceptable);
  } catch (error: any) {
    core.setFailed(error.message);
    core.endGroup(); // End any lingering groups...
    process.exit(1);
  }
}

run().then(() => {
  core.info('Completed.');
});
