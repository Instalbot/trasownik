import amqplib from "amqplib";
import { Pool } from "pg";

import logger from "./logger";

import "dotenv/config";

//--[ INTERFACES ]--------------------------------------------------------------

interface DatabaseFlagsResult {
    userid: number
    todo: boolean
    hoursrange: `[${number},${number}]`
    instaling_user: string
    instaling_pass: string
    error_level: number
}

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

    let lastReset = new Date().getDay();
    let queue: { time: number, flags: DatabaseFlagsResult }[] = [];
    const queueName = "botqueue";

    channel.assertQueue(queueName, { exclusive: true, durable: true });

    channel.consume(queueName, async msg => {
        if (!msg || !msg.properties.correlationId) return;

        console.log("Consumed message: ", msg.content.toString(), msg.properties.correlationId);
    });

    function sendToQueue(id: string) {
        channel.sendToQueue(queueName, Buffer.from(id), { correlationId: id, replyTo: queueName });
    }

    async function resetQueue() {
        const result = await pool.query("UPDATE flags SET todo = TRUE WHERE todo = FALSE");
        return result;
    }

    async function fetchQueue() {
        const result: any = await pool.query("SELECT * FROM flags WHERE todo = TRUE");
        return result.rows as DatabaseFlagsResult[];
    }

    async function checkQueue() {
        const flags = await fetchQueue();
        
        for (const result of flags) {
            const date = new Date();
            const [start, end] = result.hoursrange.replace(/[\[\]]/g, "").split(",");

            date.setHours(
                // generate random hour between user specified range
                Math.floor(Math.random() * (parseInt(end) - parseInt(start))) + parseInt(start),
                Math.floor(Math.random() * 59),  // generate random minute
                Math.floor(Math.random() * 59)   // generate random second
            );

            queue.push({ time: date.getTime(), flags: result });
        }

        const currentTime = new Date().getTime()
        const newQueue = queue;

        // display all records for debuging purposes
        for (const q of queue) {
            if (!q) continue;

            if (currentTime	>= q.time) {
                logger.log(new Date(currentTime).toLocaleTimeString("pl"), new Date(q.time).toLocaleTimeString("pl"), q.flags.instaling_user, q.flags.hoursrange);
                sendToQueue(q.flags.userid.toString());
                delete newQueue[newQueue.indexOf(q)];
            }
        }

        queue = newQueue;
    }

    setInterval(async () => {
        const currentDay = new Date().getDay();
        if (currentDay !== lastReset) {
            lastReset = currentDay;
            await resetQueue();
        }

        await checkQueue();
    }, 20000);

    logger.ready("Instalbot trasownik is ready!");
}

startWorker();
