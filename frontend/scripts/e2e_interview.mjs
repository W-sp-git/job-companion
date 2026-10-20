// 浏览器端到端验证：面试全流程（默认驱动本机 Microsoft Edge）
// 运行：node scripts/e2e_interview.mjs
// 可用 E2E_BROWSER 指定浏览器可执行文件
import { chromium } from "playwright-core";

const EDGE =
  process.env.E2E_BROWSER ||
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";
const BASE = "http://localhost:5173";

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`[console.error] ${m.text()}`);
});
page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));

function step(msg) {
  console.log(`\n=== ${msg} ===`);
}

try {
  step("1) 打开面试设置页");
  await page.goto(`${BASE}/interview`, { waitUntil: "networkidle" });
  await page.waitForSelector('input[placeholder="如：Java 后端开发工程师"]');
  await page.screenshot({ path: "/tmp/e2e_1_setup.png" });

  step("2) 填写岗位并开始面试");
  await page.fill('input[placeholder="如：Java 后端开发工程师"]', "前端开发工程师");
  await page.click('button:has-text("开始面试")');

  step("3) 等待开场流式输出（流式 token）");
  await page.waitForFunction(
    () => {
      const bubbles = document.querySelectorAll("main .whitespace-pre-wrap");
      return bubbles.length > 0 && (bubbles[0].textContent || "").length > 30;
    },
    null,
    { timeout: 90000 },
  );
  await page.waitForTimeout(4000); // 让开场白流完
  const openingText = await page
    .locator("main .whitespace-pre-wrap")
    .first()
    .textContent();
  console.log("开场白前 60 字：", openingText.slice(0, 60));
  console.log("当前 URL（应为 /interview/<id>）：", page.url());
  if (!/\/interview\/[a-z0-9]+/.test(page.url())) {
    throw new Error(`URL 未 deep-link 到会话：${page.url()}`);
  }
  await page.screenshot({ path: "/tmp/e2e_2_opening.png" });

  step("4) 输入回答并发送");
  const textarea = page.locator('textarea[placeholder*="输入你的回答"]');
  await textarea.waitFor({ timeout: 15000 });
  await textarea.fill(
    "我做过校园商城项目，负责商品列表和购物车，用 React 实现虚拟列表把长列表滚动性能提升了 40%。",
  );
  await textarea.press("Enter");

  step("5) 等待评分（右栏出现已评分 1 题）");
  await page.waitForFunction(
    () => document.body.innerText.includes("已评分 1"),
    null,
    { timeout: 120000 },
  );
  console.log("评分已返回");
  await page.screenshot({ path: "/tmp/e2e_3_scored.png" });

  step("6) 提前结束并出报告");
  await page.click('button:has-text("提前结束并出报告")');
  await page.waitForFunction(
    () => document.body.innerText.includes("面试复盘报告"),
    null,
    { timeout: 180000 },
  );
  console.log("复盘报告已弹出");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "/tmp/e2e_4_report.png" });

  step("7) 刷新页面验证聊天记录恢复");
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(
    () => document.body.innerText.includes("查看复盘报告"),
    null,
    { timeout: 60000 },
  );
  const bubbleCount = await page.locator("main .whitespace-pre-wrap").count();
  console.log(`刷新后：聊天记录已恢复（${bubbleCount} 条消息气泡），报告入口存在`);
  await page.screenshot({ path: "/tmp/e2e_5_reload.png" });

  console.log("\n结果：全部通过 ✅");
} catch (e) {
  console.log("\n结果：失败 ❌");
  console.error(e);
  await page.screenshot({ path: "/tmp/e2e_fail.png" }).catch(() => {});
} finally {
  if (errors.length) {
    console.log("\n浏览器错误日志：");
    for (const e of errors) console.log(" ", e.slice(0, 300));
  } else {
    console.log("\n浏览器控制台无错误");
  }
  await browser.close();
}
