import "dotenv/config";
import chromium from "chrome-aws-lambda";
import fs from "fs";
import path from "path";
import { document } from "../utils/dynamodbClient";
import handlebars from "handlebars";
import dayjs from "dayjs";
import { S3 } from "aws-sdk";
import { APIGatewayProxyHandler } from "aws-lambda";

interface ICreateCertificate {
  id: string;
  name: string;
  grade: string;
}

interface ITemplate {
  id: string;
  name: string;
  grade: string;
  date: string;
  medal: string;
}

const compile = async (data: ITemplate) => {
  const filePath = path.join(
    process.cwd(),
    "src",
    "templates",
    "certificate.hbs"
  );

  const html = fs.readFileSync(filePath, "utf-8");

  return handlebars.compile(html)(data);
};

export const handle: APIGatewayProxyHandler = async (event) => {
  const { id, name, grade } = JSON.parse(event.body) as ICreateCertificate;

  const response = await document
    .query({
      TableName: "users_certificates",
      KeyConditionExpression: "id = :id",
      ExpressionAttributeValues: {
        ":id": id,
      },
    })
    .promise();

  const userCertificateExists = response.Items[0];

  if (!userCertificateExists) {
    await document
      .put({
        TableName: "users_certificates",
        Item: {
          id,
          name,
          grade,
        },
      })
      .promise();
  }

  const medalPath = path.join(process.cwd(), "src", "templates", "selo.png");
  const medal = fs.readFileSync(medalPath, "base64");

  const data: ITemplate = {
    id,
    date: dayjs().format("DD/MM/YYYY"),
    grade,
    name,
    medal,
  };

  const content = await compile(data);

  const browser = await chromium.puppeteer.launch({
    headless: true,
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath,
  });

  const page = await browser.newPage();
  await page.setContent(content);

  const pdf = await page.pdf({
    format: "a4",
    landscape: true,
    path: process.env.IS_OFFLINE ? "certificate.pdf" : null,
    printBackground: true,
    preferCSSPageSize: true,
  });

  await browser.close();

  const s3 = new S3();

  await s3
    .putObject({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: `${id}.pdf`,
      ACL: "public-read",
      Body: pdf,
      ContentType: "application/pdf",
    })
    .promise();

  return {
    statusCode: 201,
    body: JSON.stringify({
      message: "Certificate created",
      url: `${process.env.AWS_S3_BUCKET_URL}/${id}.pdf`,
    }),
    headers: {
      "Content-Type": "application/json",
    },
  };
};
