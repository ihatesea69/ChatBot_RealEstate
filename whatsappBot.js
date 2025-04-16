// Khởi tạo client
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: sessionPath,
  }),
  puppeteer: {
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--disable-gpu",
    ],
    executablePath: "/usr/bin/google-chrome-stable",
    headless: true,
  },
});
