import { Composer, InputFile } from "grammy";
import type { Ctx } from "../bot.js";
import { dataFor, formatCsv, formatText, makeBatch, now, preview, validatePattern } from "../credentials.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";

registerMainMenuItem({ label: "Generate Batch", data: "generate:start", order: 10 });

const composer = new Composer<Ctx>();

function resetFlow(ctx: Ctx): void {
  ctx.session.step = undefined;
  ctx.session.pendingBatchSize = undefined;
  ctx.session.pendingUsernamePattern = undefined;
  ctx.session.flowExpiresAt = undefined;
}

async function isExpired(ctx: Ctx): Promise<boolean> {
  if (ctx.session.flowExpiresAt && now() > ctx.session.flowExpiresAt) {
    resetFlow(ctx);
    await ctx.reply("That draft expired. Tap Generate Batch to start again.");
    return true;
  }
  return false;
}

function patternKeyboard() {
  return inlineKeyboard([
    [inlineButton("Use saved pattern", "generate:use-pattern")],
    [inlineButton("Enter another pattern", "generate:custom-pattern")],
    [inlineButton("Back to menu", "menu:main")],
  ]);
}

async function finishGeneration(ctx: Ctx): Promise<void> {
  const data = dataFor(ctx.session.credentialData);
  const size = ctx.session.pendingBatchSize;
  if (!size) {
    await ctx.reply("Choose a batch size first.");
    return;
  }
  if (data.batches.length >= 100) {
    resetFlow(ctx);
    ctx.session.credentialData = data;
    await ctx.reply("Your saved batch limit is reached. Try again after older batches are cleared.");
    return;
  }
  const settings = ctx.session.pendingUsernamePattern
    ? { ...data.settings, username_pattern: ctx.session.pendingUsernamePattern }
    : data.settings;
  const batch = makeBatch(settings, size);
  data.batches.push(batch);
  ctx.session.credentialData = data;
  resetFlow(ctx);
  await ctx.reply(`Your ${size} credential pairs are ready.\n\nPreview:\n${preview(batch)}`);
  await ctx.replyWithDocument(new InputFile(new TextEncoder().encode(formatText(batch)), "credentials.txt"));
  await ctx.replyWithDocument(new InputFile(new TextEncoder().encode(formatCsv(batch, data.settings.include_csv_header)), "credentials.csv"));
}

composer.callbackQuery("generate:start", async (ctx) => {
  await ctx.answerCallbackQuery();
  const data = dataFor(ctx.session.credentialData);
  ctx.session.credentialData = data;
  ctx.session.step = "awaiting_batch_size";
  ctx.session.pendingBatchSize = undefined;
  ctx.session.flowExpiresAt = now() + 5 * 60 * 1000;
  ctx.session.pendingUsernamePattern = undefined;
  await ctx.reply(`How many credential pairs do you need? Enter a whole number from 1 to ${data.settings.max_batch_size}.`, {
    reply_markup: { force_reply: true, input_field_placeholder: "Enter batch size" },
  });
});

composer.callbackQuery("generate:use-pattern", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (await isExpired(ctx)) return;
  await finishGeneration(ctx);
});

composer.callbackQuery("generate:custom-pattern", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (await isExpired(ctx)) return;
  if (!ctx.session.pendingBatchSize) {
    await ctx.reply("Choose a batch size first.");
    return;
  }
  ctx.session.step = "awaiting_generation_pattern";
  ctx.session.flowExpiresAt = now() + 5 * 60 * 1000;
  await ctx.reply("Enter a username pattern with {n}, such as account{n}.", {
    reply_markup: { force_reply: true, input_field_placeholder: "account{n}" },
  });
});

composer.on("message:text", async (ctx, next) => {
  if ((ctx.session.step === "awaiting_batch_size" || ctx.session.step === "awaiting_generation_pattern") && await isExpired(ctx)) return;
  if (ctx.session.step === "awaiting_batch_size") {
    const data = dataFor(ctx.session.credentialData);
    ctx.session.credentialData = data;
    const raw = ctx.message.text.trim();
    if (!/^\d+$/.test(raw)) {
      await ctx.reply(`Enter a whole number from 1 to ${data.settings.max_batch_size}.`);
      return;
    }
    const size = Number(raw);
    if (size < 1 || size > data.settings.max_batch_size) {
      await ctx.reply(`Choose a number from 1 to ${data.settings.max_batch_size}.`);
      return;
    }
    ctx.session.pendingBatchSize = size;
    ctx.session.step = undefined;
    ctx.session.flowExpiresAt = now() + 5 * 60 * 1000;
    await ctx.reply(`Use your saved pattern “${data.settings.username_pattern}”?`, { reply_markup: patternKeyboard() });
    return;
  }
  if (ctx.session.step === "awaiting_generation_pattern") {
    const pattern = ctx.message.text.trim();
    const problem = validatePattern(pattern);
    if (problem) {
      await ctx.reply(`That pattern won't work. ${problem}`);
      return;
    }
    const data = dataFor(ctx.session.credentialData);
    ctx.session.pendingUsernamePattern = pattern;
    await finishGeneration(ctx);
    return;
  }
  return next();
});

export default composer;
