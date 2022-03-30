const { URL, LICENSE, REFERENCE, API_KEY, WEBSITE_KEY, Sender, Recipient, SENDGRID_API_KEY, DATE_RANGE, TIME_RANGE } = require('./config.json');
const sgMail = require('@sendgrid/mail');
const puppeteer = require('puppeteer-extra');
const XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const ac = require("@antiadmin/anticaptchaofficial");
ac.setAPIKey(API_KEY);
ac.getBalance()
  .then(balance => console.log('My balance is $' + balance))
  .catch(error => console.log('Received error ' + error));
sgMail.setApiKey(SENDGRID_API_KEY);
const options = { width: 1440, height: 942 };

let browser = null;
let page = null;
let index = 0;

const start = () => {
  console.log('The bot is running now.');
  startBot();
};

const startBot = async () => {
  try {
    console.log(`${index % 5 + 1}`);
    // Create browser and set windows-size
    browser = await puppeteer.launch({
      // executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      userDataDir: `%userprofile%\\AppData\\Local\\Google\\Chrome\\User Data\\Profile ${index % 5 + 1}`,
      args: [
        `--window-size=${options.width},${options.height}`,
        '--no-sandbox',
        '--allow-running-insecure-content',
        // '--proxy-server=18.168.154.132:3128'
      ],
      headless: false
    });

    // Create page and set page size
    page = (await browser.pages())[0];
    await page.setViewport({ width: options.width, height: options.height });
    await page.setDefaultNavigationTimeout(0);    
    await page.goto(`http://api.scraperapi.com?api_key=5771fd74e26f97d1eae22547e64a0b9d&url=${URL}&render=true`);
    await checkRecaptcha();
    await page.waitForSelector('#driving-licence-number', { visible: true });
    // Input driving license
    await page.type('#driving-licence-number', LICENSE);
    await page.type('#application-reference-number', REFERENCE);
    await page.click('#booking-login');
    await checkRecaptcha();
    await page.waitForSelector('#date-time-change', { visible: true });
    const name = await page.evaluate(() => document.querySelector('#confirm-booking-details').querySelectorAll('dd')[2].textContent);
    await page.click('#date-time-change');
    await checkRecaptcha();
    await page.waitForSelector('#test-choice-earliest', { visible: true });
    await page.click('#test-choice-earliest');
    await page.click('#driving-licence-submit');
    await checkRecaptcha();
    await checkBookable(name);
  } catch (error) {
    console.log('Close the browser');
    await browser.close();
    await new Promise((resolve) => {
      setTimeout(() => {
        index++;
        startBot();
        resolve(true);
      }, 5000);
    });
  }
};

const checkRecaptcha = async () => {
  await page.waitForTimeout(1000);
  const IncapsulaID = await page.evaluate(() => document.getElementById('main-iframe')?.textContent.split('-')[1]);
  if (Boolean(IncapsulaID)) {
    const recaptchaResponse = await page.evaluate(() => {
      const iframe = document.getElementById('main-iframe');
      let innerDoc = iframe.contentDocument || iframe.contentWindow.document;
      return innerDoc.getElementById("g-recaptcha-response");
    });
    if (Boolean(recaptchaResponse)) {
      await new Promise((resolve, reject) => {
        ac.solveRecaptchaV2Proxyless(URL, WEBSITE_KEY).then(async (taskSolution) => {
          const result = await page.evaluate((taskSolution, IncapsulaID) => {
            return new Promise((resolve) => {
              let xhr = new XMLHttpRequest();
              let msg = "g-recaptcha-response=" + taskSolution;
              console.log(taskSolution, IncapsulaID);
              xhr.open("POST", `https://driverpracticaltest.dvsa.gov.uk/_Incapsula_Resource?SWCGHOEL=v2&dai=${IncapsulaID}`, true);
              xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
              xhr.onreadystatechange = function receiveResponse() {
                if (this.readyState == 4) {
                  if (this.status == 200) {
                    return resolve(true);
                  } else if (this.status == 0) {
                    return resolve(false);
                  }
                }
              };
              xhr.send(msg);
            });
          }, taskSolution, IncapsulaID);

          if (result) {
            console.log('Recaptcha is solved');
            await page.reload();
            setTimeout(() => {
              resolve(true);
            }, 5000);
          } else {
            console.log('Recaptcha service is not avaiable now');
            reject(false);
          }
        }).catch(() => {
          console.log('Recaptcha service is not avaiable now');
          reject(false);
        });
      });
    }
  }
};

const checkBookable = async (name) => {
  try {
    await page.waitForTimeout(1000);
    const bookable = await page.evaluate(() => document.querySelector('.BookingCalendar-date--bookable')?.querySelector('a').dataset.date);
    if (Boolean(bookable)) {
      console.log('bookable: ', bookable);
      const dates = DATE_RANGE.split(' ~ ');
      const startTime = new Date(dates[0]);
      const endTime = new Date(dates[1]);
      const bookableTime = new Date(bookable);
      if (bookableTime >= startTime && bookableTime <= endTime) {
        const time = await page.evaluate((bookable, TIME_RANGE) => {
          document.querySelector('.BookingCalendar-date--bookable').querySelector('a').click();
          document.querySelector('.SlotPicker-day.is-active').querySelector('label').click();
          const times = document.querySelector('.SlotPicker-day.is-active').querySelectorAll('label');
          for (let i = 0; i < times.length; i++) {
            const time = times[i].querySelector('strong').textContent;
            const startTime = new Date(`${bookable} ${TIME_RANGE.split(' ~ ')[0]}`);
            const endTime = new Date(`${bookable} ${TIME_RANGE.split(' ~ ')[1]}`);
            const bookableTime = new Date(`${bookable} ${time.slice(0, time.length - 2)} ${time.slice(time.length - 2)}`);
            if (bookableTime >= startTime && bookableTime <= endTime) {
              times[i].click();
              document.querySelector('#slot-chosen-submit').click();
              document.querySelector('#slot-warning-continue').click();
              return time;
            }
          }

          return null;
        }, bookable, TIME_RANGE);
        if (Boolean(time)) {
          await checkRecaptcha();
          await page.waitForTimeout(1000);
          const candidate = await page.evaluate(() => {
            const candidate = document.querySelector('#i-am-candidate');
            Boolean(candidate) && candidate.click();
            return candidate;
          });
          if (Boolean(candidate)) {
            await checkRecaptcha();
            await page.waitForSelector('#confirm-changes', { visible: true });
            await page.click('#confirm-changes');
            notifyCenter(`Booking has confirmed ${bookable} at ${time} (${name})`);
          } else {
            notifyCenter(`${bookable} at ${time} (${name}) (Payment 13£ Pending)`);
          }
        } else {
          await page.click('#change-test-centre');
          await checkRecaptcha();
          await checkCenters();
        }
      } else {
        await page.click('#change-test-centre');
        await checkRecaptcha();
        checkCenters();
      }
    } else {
      const exitBtn = await page.evaluate(() => {
        const btn = document.querySelector("a[href='https://www.gov.uk/change-driving-test']");
        if (Boolean(btn)) {
          document.querySelector("a[href='https://www.gov.uk/change-driving-test']").click();
          return btn;
        } else {
          return null;
        }
      });
      if (Boolean(exitBtn)) {
        await browser.close();
        await new Promise((resolve) => {
          setTimeout(() => {
            index++;
            startBot();
            resolve(true);
          }, 5000);
        });
      } else {
        await page.click('#change-test-centre');
        await checkRecaptcha();
        checkCenters();
      }
    }
  } catch (error) {
    console.log('Close the browser 2');
    await browser.close();
    await new Promise((resolve) => {
      setTimeout(() => {
        index++;
        startBot();
        resolve(true);
      }, 5000);
    });
  }
}

const checkCenters = async () => {
  try {
    await page.waitForTimeout(1000);
    const formatting = await page.evaluate(() => document.querySelector('#formatting'));
    if (Boolean(formatting)) {
      await browser.close();
      await new Promise((resolve) => {
        setTimeout(() => {
          index++;
          startBot();
          resolve(true);
        }, 5000);
      });
    } else {
      await page.click('#test-centres-submit');
      await page.waitForTimeout(1000);
      await checkRecaptcha();
      const name = await page.evaluate(() => {
        document.querySelector('li.clear').querySelector('a').click();
        return document.querySelector('li.clear').querySelector('h4').textContent;
      });
      await checkRecaptcha();
      checkBookable(name);
    }
  } catch (error) {
    console.log('Close the browser 3');
    await browser.close();
    await new Promise((resolve) => {
      setTimeout(() => {
        index++;
        startBot();
        resolve(true);
      }, 5000);
    });
  }
};

const notifyCenter = async (data) => {
  // Send Email
  console.log(data);
  const text = `<p><b>${data}</b></p>`;
  const msg = {
    to: Recipient,
    from: Sender,
    subject: 'Available center',
    html: text,
  };

  sgMail
    .send(msg)
    .then(() => {
      console.log('Email is sent.');
    })
    .catch((error) => {
      console.log(error);
    });
};

start();