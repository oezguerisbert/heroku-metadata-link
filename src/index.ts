const express = require("express");
const puppeteer = require("puppeteer");
const cors = require("cors");
const { load } = require("cheerio");

const app = express();
app.use(cors({ origin: "*" }));
app.set("port", process.env.PORT || 5000);

const browserP = puppeteer.launch({
  args: ["--incognito", "--no-sandbox", "--single-process", "--no-zygote"],
});

class DataCache {
  millisecondsToLive: number;
  fetchFunction: Function;
  cache: { [n: string]: { date: Date; content: any } };
  constructor(fetchFunction, minutesToLive = 15) {
    this.millisecondsToLive = minutesToLive * 60 * 1000;
    this.fetchFunction = fetchFunction;
    this.cache = {};
    this.getData = this.getData.bind(this);
    this.isCacheExpired = this.isCacheExpired.bind(this);
  }
  isCacheExpired(link: string) {
    if (!this.cache[link]?.date) {
      return true;
    } else {
      return this.cache[link]?.date!.getTime()! + this.millisecondsToLive < new Date().getTime();
    }
  }
  getData(link: string) {
    if (!this.cache || this.isCacheExpired(link)) {
      return this.fetchFunction(link)
        .then((data) => {
          this.cache[link] = { date: new Date(), content: data };
          return data;
        })
        .catch((e) => {
          return e;
        });
    } else {
      return Promise.resolve(this.cache[link]?.content);
    }
  }
}
let cache: DataCache;
app.get("/", async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (typeof cache === "undefined" || cache === null) {
    cache = new DataCache(
      (link: string) =>
        new Promise(async (resolve, reject) => {
          if (!link) {
            reject({ message: "please specify a link in the query 'link'" });
          }
          const url = link as string;
          const page = await (await browserP).newPage();
          await page.setUserAgent(
            "Opera/9.80 (J2ME/MIDP; Opera Mini/5.1.21214/28.2725; U; ru) Presto/2.8.119 Version/11.10"
          );
          try {
            await page.goto(url, { waitUntil: "networkidle0" });

            const content = await page.content();
            const $ = await load(content);
            const titleQuery = "html head title";
            const metasQuery = "html head meta";
            let title = $(titleQuery)?.text() ?? "";
            let metas =
              $(metasQuery)
                ?.get()
                .map((e) => e.attribs) ?? [];
            await page.close();
            resolve({ title, metas });
          } catch (error) {
            reject({ message: "This URL does not exist" });
          }
        })
    );
  }
  const stuff = await cache.getData(req.query.link as string);
  res.end(JSON.stringify(stuff));
});

app.listen(app.get("port"), () => console.log("app running on port", app.get("port")));
