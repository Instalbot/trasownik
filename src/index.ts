import amqplib from "amqplib";
import { Pool } from "pg";

import "dotenv/config";

//--[ ENV ]---------------------------------------------------------------------

const env = process.env as {
    DATABASE_USERNAME: string,
    DATABASE_PASSWORD: string,
    DATABASE_HOST:     string,
    DATABASE_NAME:     string,
    RABBITMQ_USERNAME: string,
    RABBITMQ_PASSWORD: string,
    RABBITMQ_HOST:     string
};

const envKeys = Object.keys(env);
let requiredKeys = [
    "DATABASE_USERNAME",
    "DATABASE_PASSWORD",
    "DATABASE_HOST",
    "DATABASE_NAME",
    "RABBITMQ_HOST",
    "RABBITMQ_USERNAME",
    "RABBITMQ_PASSWORD"
].filter(key => !envKeys.includes(key));

if (requiredKeys.length > 0) {
    console.error(`.env file is missing the following keys: ${requiredKeys.join(", ")}`);
    process.exit(1);
};

//--[ BOT ]---------------------------------------------------------------------

const pool = new Pool({
    user:     env.DATABASE_USERNAME,
    password: env.DATABASE_PASSWORD,
    host:     env.DATABASE_HOST,
    database: env.DATABASE_NAME
});

async function startWorker() {
	const connection = await amqplib.connect(`amqp://${env.RABBITMQ_USERNAME}:${env.RABBITMQ_PASSWORD}@${env.RABBITMQ_HOST}`);    
	const channel = await connection.createChannel();
	
	const queue = "botqueue";
	channel.assertQueue(queue, { exclusive: true, durable: true });

	channel.consume(queue, async msg => {
		if (!msg.properties.correlationId) return;

		console.log("Consumed message: ", msg.content.toString(), msg.properties.correlationId);
	});


	function sendToQueue(username: string) {
		channel.sendToQueue(queue, Buffer.from("DUPA"), { correlationId: username, replyTo: queue });
	}

	function checkQueue() {
		console.log("Checking queue...");
		sendToQueue("babasialamak");
	}

	setInterval(checkQueue, 5000);
}

startWorker();
