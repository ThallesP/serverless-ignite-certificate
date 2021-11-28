import { APIGatewayProxyHandler } from "aws-lambda";
import { document } from "src/utils/dynamodbClient";

export const handle: APIGatewayProxyHandler = async (event) => {
  const { id } = event.pathParameters;

  const response = await document
    .query({
      TableName: "users_certificates",
      KeyConditionExpression: "id = :id",
      ExpressionAttributeValues: {
        ":id": id,
      },
    })
    .promise();

  const userCertificate = response.Items[0];

  if (userCertificate) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Valid certificate",
        name: userCertificate.name,
        url: `${process.env.AWS_S3_BUCKET_URL}/${id}.pdf`,
      }),
    };
  }

  return {
    statusCode: 400,
    body: JSON.stringify({ message: "Invalid certificate" }),
  };
};
