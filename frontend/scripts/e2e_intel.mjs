// 浏览器端到端验证：公司背调全流程（驱动本机 Microsoft Edge）
// 运行：node scripts/e2e_intel.mjs（需后端 8010 + 前端 5173 已启动）
import { chromium } from "playwright-core";

const EDGE = "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";
const BASE = "http://localhost:5173";

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

const errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`[console.error] ${m.text()}`);
});
page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));

function step(msg) {
  console.log(`\n=== ${msg} ===`);
}

try {
  step("1) 打开情报处委托单");
  await page.goto(`${BASE}/intel`, { waitUntil: "networkidle" });
  await page.waitForSelector('input[placeholder="如：字节跳动"]');
  await page.waitForSelector("text=背调存档");
  await page.screenshot({ path: "/tmp/e2e_intel_1_form.png" });
  console.log("委托单与存档栏已渲染");

  step("2) 填写公司并开始背调");
  await page.fill('input[placeholder="如：字节跳动"]', "网易");
  await page.fill('input[placeholder="如：后端开发工程师"]', "后端开发工程师");
  await page.click('button:has-text("生成背调报告")');

  step("3) 等待进度仪式（COLLECTING INTELLIGENCE）");
  await page.waitForSelector("text=COLLECTING INTELLIGENCE", { timeout: 30000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "/tmp/e2e_intel_2_progress.png" });
  console.log("进度清单已出现");

  step("4) 等待情报简报生成（4 路检索 + 抽取 + 校验）");
  await page.waitForFunction(
    () => document.body.innerText.includes("情报简报"),
    null,
    { timeout: 260000 },
  );
  if (!/\/intel\/\d+/.test(page.url())) {
    throw new Error(`URL 未 deep-link 到存档：${page.url()}`);
  }
  const url = page.url();
  console.log("深链地址：", url);
  await page.waitForTimeout(800);

  step("5) 断言报告要素");
  const text = await page.evaluate(() => document.body.innerText);
  for (const kw of ["防虚构校验", "公司基本面", "在招岗位", "薪资待遇", "面试流程", "风险信号", "参考来源"]) {
    if (!text.includes(kw)) throw new Error(`报告缺少要素：${kw}`);
  }
  const refCount = await page.locator('a[href^="#intel-src-"]').count();
  console.log(`报告要素齐全；来源引用锚点 ${refCount} 处`);
  if (refCount === 0) throw new Error("没有 [Sx] 来源引用");
  await page.screenshot({ path: "/tmp/e2e_intel_3_report.png", fullPage: false });

  step("6) 刷新深链验证存档恢复");
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(
    () => document.body.innerText.includes("情报简报"),
    null,
    { timeout: 60000 },
  );
  const afterReload = await page.evaluate(() => document.body.innerText);
  if (!afterReload.includes("风险信号")) throw new Error("刷新后报告不完整");
  console.log("刷新后报告完整恢复");
  await page.screenshot({ path: "/tmp/e2e_intel_4_reload.png" });

  console.log("\n结果：全部通过 ✅");
} catch (e) {
  console.log("\n结果：失败 ❌");
  console.error(e);
  await page.screenshot({ path: "/tmp/e2e_intel_fail.png" }).catch(() => {});
} finally {
  if (errors.length) {
    console.log("\n浏览器错误日志：");
    for (const e of errors) console.log(" ", e.slice(0, 300));
  } else {
    console.log("\n浏览器控制台无错误");
  }
  await browser.close();
}
