import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { dataFor, now, type PasswordPolicy, validatePattern } from "../credentials.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";

registerMainMenuItem({ label: "Settings", data: "settings:view", order: 20 });

const composer = new Composer<Ctx>();

function settingsText(ctx: Ctx): string {
  const settings = dataFor(ctx.session.credentialData).settings;
  return `Your settings\n\nUsername pattern: ${settings.username_pattern}\nPassword strength: ${settings.password_policy}\nBatch limit: ${settings.max_batch_size}\nCSV header: ${settings.include_csv_header ? "included" : "not included"}`;
}

function settingsKeyboard(ctx: Ctx) {
  const header = dataFor(ctx.session.credentialData).settings.include_csv_header;
  return inlineKeyboard([
    [inlineButton("Set username pattern", "settings:pattern"), inlineButton("Set password strength", "settings:policy")],
    [inlineButton("Set batch limit", "settings:limit"), inlineButton(header ? "Remove CSV header" : "Include CSV header", "settings:header")],
    [inlineButton("Back to menu", "menu:main")],
  ]);
}

async function showSettings(ctx: Ctx, edit = false): Promise<void> {
  const data = dataFor(ctx.session.credentialData);
  ctx.session.credentialData = data;
  if (edit) await ctx.editMessageText(settingsText(ctx), { reply_markup: settingsKeyboard(ctx) });
  else await ctx.reply(settingsText(ctx), { reply_markup: settingsKeyboard(ctx) });
}

composer.callbackQuery("settings:view", async (ctx) => {
  await ctx.answerCallbackQuery();
  await showSettings(ctx);
});

composer.callbackQuery("settings:pattern", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "awaiting_setting_pattern";
  ctx.session.flowExpiresAt = now() + 5 * 60 * 1000;
  await ctx.reply("Enter a username pattern with {n}, such as account{n}.", {
    reply_markup: { force_reply: true, input_field_placeholder: "account{n}" },
  });
});

composer.callbackQuery("settings:limit", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "awaiting_setting_limit";
  ctx.session.flowExpiresAt = now() + 5 * 60 * 1000;
  await ctx.reply("Enter a batch limit from 1 to 100.", {
    reply_markup: { force_reply: true, input_field_placeholder: "25" },
  });
});

composer.callbackQuery("settings:policy", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply("Choose the password strength.", {
    reply_markup: inlineKeyboard([
      [inlineButton("Standard", "settings:policy:standard"), inlineButton("Strong", "settings:policy:strong")],
      [inlineButton("Maximum", "settings:policy:maximum")],
    ]),
  });
});

composer.callbackQuery(/^settings:policy:(standard|strong|maximum)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const policy = ctx.match[1] as PasswordPolicy;
  const data = dataFor(ctx.session.credentialData);
  data.settings.password_policy = policy;
  ctx.session.credentialData = data;
  await ctx.reply("Password strength updated.");
  await showSettings(ctx);
});

composer.callbackQuery("settings:header", async (ctx) => {
  await ctx.answerCallbackQuery();
  const data = dataFor(ctx.session.credentialData);
  data.settings.include_csv_header = !data.settings.include_csv_header;
  ctx.session.credentialData = data;
  await ctx.reply(`CSV header ${data.settings.include_csv_header ? "included" : "removed"}.`);
  await showSettings(ctx);
});

composer.on("message:text", async (ctx, next) => {
  if ((ctx.session.step === "awaiting_setting_pattern" || ctx.session.step === "awaiting_setting_limit") && ctx.session.flowExpiresAt && now() > ctx.session.flowExpiresAt) {
    ctx.session.step = undefined;
    ctx.session.flowExpiresAt = undefined;
    await ctx.reply("That draft expired. Open Settings to try again.");
    return;
  }
  if (ctx.session.step === "awaiting_setting_pattern") {
    const pattern = ctx.message.text.trim();
    const problem = validatePattern(pattern);
    if (problem) {
      await ctx.reply(`That pattern won't work. ${problem}`);
      return;
    }
    const data = dataFor(ctx.session.credentialData);
    data.settings.username_pattern = pattern;
    ctx.session.credentialData = data;
    ctx.session.step = undefined;
    ctx.session.flowExpiresAt = undefined;
    await ctx.reply("Username pattern updated.");
    await showSettings(ctx);
    return;
  }
  if (ctx.session.step === "awaiting_setting_limit") {
    const raw = ctx.message.text.trim();
    if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 100) {
      await ctx.reply("Enter a whole number from 1 to 100.");
      return;
    }
    const data = dataFor(ctx.session.credentialData);
    data.settings.max_batch_size = Number(raw);
    ctx.session.credentialData = data;
    ctx.session.step = undefined;
    ctx.session.flowExpiresAt = undefined;
    await ctx.reply("Batch limit updated.");
    await showSettings(ctx);
    return;
  }
  return next();
});

export default composer;
