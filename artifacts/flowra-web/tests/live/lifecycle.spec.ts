import { test } from '@playwright/test';
import { liveEnvironment } from '../../playwright.live.config';
import { runLifecycle } from './lifecycle-workflow';

test('real account: isolated schedule, linked task and memo lifecycle', async ({ page, context }, testInfo) => {
  test.skip(process.env.QA_MUTATIONS !== '1', 'Set QA_MUTATIONS=1 to create and remove isolated QA resources.');
  test.setTimeout(300_000);
  await runLifecycle(page, context, liveEnvironment, testInfo);
});
