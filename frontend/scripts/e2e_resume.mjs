// 浏览器端到端验证：简历优化全流程（驱动本机 Microsoft Edge）
// 运行：node scripts/e2e_resume.mjs
import { chromium } from "playwright-core";

const EDGE = "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";
const BASE = "http://localhost:5173";
const RESUME = "/Users/wang/Local_file/backend/samples/resume_text.pdf";
const JD =
  "负责后端服务的设计与开发；要求：熟悉 Java、Spring Boot、MySQL、Redis；了解消息队列 Kafka/RocketMQ；熟悉 Linux 常用命令；具备良好的工程习惯（单元测试、代码评审）；有分布式系统经验者优先。";

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

const errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push(e.message));

function step(msg) {
  console.log(`\n=== ${msg} ===`);
}

try {
  step("1) 上传简历并等待解析");
  await page.goto(`${BASE}/resume`, { waitUntil: "networkidle" });
  await page.setInputFiles('input[type="file"]', RESUME);
  await page.waitForSelector("text=解析路线", { timeout: 120000 });
  console.log("解析完成：", await page.locator("text=解析路线").first().textContent());

  step("2) 填公司与 JD，开始优化（第 1 轮，含联网调研）");
  await page.fill('input[placeholder="如：字节跳动"]', "字节跳动");
  await page.fill("textarea", JD);
  await page.click('button:has-text("开始优化简历")');
  await page.waitForSelector('a:has-text("下载")', { timeout: 420000 });
  console.log("第 1 轮优化完成");
  await page.screenshot({ path: "/tmp/e2e_resume_1.png", fullPage: true });

  step("3) 下载 .docx");
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 30000 }),
    page.locator('a:has-text("下载 .docx")').click(),
  ]);
  console.log("下载文件名：", download.suggestedFilename());

  step("4) 第二轮优化 → 生成 v2");
  await page.click('button:has-text("开始优化简历")');
  await page.waitForFunction(() => document.body.innerText.includes("v2 ·"), null, {
    timeout: 420000,
  });
  console.log("v2 已生成，版本列表刷新");

  step("5) 版本对比");
  await page.locator('button:has-text("对比")').first().click();
  await page.waitForSelector("text=版本对比", { timeout: 15000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: "/tmp/e2e_resume_diff.png" });
  console.log("版本对比弹层已渲染");

  console.log("\n结果：全部通过 ✅");
} catch (e) {
  console.log("\n结果：失败 ❌");
  console.error(e);
  await page.screenshot({ path: "/tmp/e2e_resume_fail.png", fullPage: true }).catch(() => {});
} finally {
  console.log(errors.length ? `\n浏览器错误：\n  ${errors.slice(0, 5).join("\n  ")}` : "\n浏览器控制台无错误");
  await browser.close();
}
