const readline = require('readline');
const fs = require('fs');
const chalk = require('chalk');
const { exec } = require('child_process');

const std = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const questions = [
    { domain: 'export', key: 'host', question: "What is the host of the origin server? (Defaults to 'localhost')", color: 'blue' },
    { domain: 'export', key: 'port', question: "What is the port of the origin server? (Defaults to '27017')", color: 'blue' },
    { domain: 'export', key: 'username', question: "What is the username of the origin server? (Defaults to 'none')", color: 'blue' },
    { domain: 'export', key: 'password', question: "What is the password of the origin server? (Defaults to 'none')", color: 'blue' },
    { domain: 'export', key: 'db', question: "What database should we export the data from? [Mandatory]", color: 'blue' },
    { domain: 'export', key: 'collections', question: "What collections should we export the data from? [Mandatory]", color: 'blue' },
    //
    { domain: 'global', key: 'willImport', question: "An import operation should be performed? (defaults to 'Yes')", color: 'grey' },
    //
    { domain: 'import', key: 'host', question: "What is the host of the destination server? (Defaults to 'localhost')", color: 'green' },
    { domain: 'import', key: 'port', question: "What is the port of the destination server? (Defaults to '27017')", color: 'green' },
    { domain: 'import', key: 'username', question: "What is the username of the destination server? (Defaults to 'none')", color: 'green' },
    { domain: 'import', key: 'password', question: "What is the password of the destination server? (Defaults to 'none')", color: 'green' },
    { domain: 'import', key: 'db', question: () => { return `What database should we import the data to? (Defaults to '${answers.export.db}')` }, color: 'green' },
    { domain: 'import', key: 'collections', question: () => { return `What collections should we import the data to? (Defaults to '${answers.export.collections}')` }, color: 'green' },
    //
    { domain: 'global', key: 'keepBackup', question: "Should keep the temporary export file as a backup? (defaults to 'Yes')", color: 'grey' }
];

const answers = {
    export: {},
    import: {},
    global: {}
};

function removeFile(filename) {
    fs.unlinkSync(resolveTempFilePath(filename));
}

function print(input, color) {
    console.log(text(input, color));
}

function text(input, color = 'white') {
    if (typeof (input) === 'function') input = input();
    return chalk[color](input);
}

function resolveTempName(collection) {
    return `${collection}-${Date.now()}`;
}

function shell(command) {
    return new Promise((resolve, reject) => {
        print(command);
        exec(command, (err, stdout, stderr) => {
            if (err) {
                print(err.message);
                reject(err);
            }
            else resolve(stdout);
        });
    });
}

function askQuestion(text) {
    return new Promise((resolve, reject) => {
        try {
            std.question(`${text} \n`, (answer) => {
                resolve(answer);
            });
        } catch (err) {
            print(err.message);
            reject(err);
        }
    })
}

async function startQuestions() {
    const nextQuestion = questions.shift();
    const shouldAskQuestion = nextQuestion.domain !== 'import' || (nextQuestion.domain === 'import' && shouldImport());
    if (shouldAskQuestion) {
        const answer = await askQuestion(text(nextQuestion.question, nextQuestion.color));
        answers[nextQuestion.domain][nextQuestion.key] = answer;
    }

    if (questions.length) await startQuestions();
}

async function executeExportCommand() {
    const { host, port, db, collections, password, username } = answers.export;
    const allCollections = collections.split(',').map(c => c.trim())
    const filenames = [];

    for (const collection of allCollections) {
        const filename = resolveTempName(collection);
        filenames.push(filename);

        const cmd = ['mongoexport'];
        cmd.push(`--host ${host || 'localhost'}`);
        cmd.push(`--port ${port || '27017'}`);

        if (!db || !collection) {
            print('You must specify a database to export the data from', 'red');
            process.exit();
        }

        cmd.push(`--db ${db}`);
        cmd.push(`--collection ${collection}`);

        if (username) cmd.push(`--username ${username}`);
        if (password) cmd.push(`--password "${password}"`);

        cmd.push(`--out ${resolveTempFilePath(filename)}`);

        const command = cmd.join(' ');
        await shell(command);
    }

    return filenames;
}

async function executeImportCommand(filenames) {
    const { host, port, db, collections, password, username } = answers.import;
    const allCollections = collections.split(',').map(c => c.trim())

    for (const key in allCollections) {
        const collection = allCollections[key];
        const filename = filenames[key];

        const cmd = ['mongoimport'];
        cmd.push(`--host ${host || 'localhost'}`);
        cmd.push(`--port ${port || '27017'}`);

        cmd.push(`--db ${db || answers.export.db}`);
        cmd.push(`--collection ${collection || answers.export.collection}`);

        if (username) cmd.push(`--username ${username}`);
        if (password) cmd.push(`--password "${password}"`);

        cmd.push(`--file ${resolveTempFilePath(filename)}`);

        const command = cmd.join(' ');
        await shell(command);
    }
}

function resolveTempFilePath(filename) {
    return `./temp/${filename}.json`;
}

function shouldKeepBackup() {
    const { keepBackup } = answers.global;
    const keep = keepBackup.toLowerCase();

    if (keep === 'n' || keep === 'no' || keep === '0') {
        return false;
    }

    // Default
    return true;
}

function shouldImport() {
    const { willImport } = answers.global;
    const will = willImport.toLowerCase();

    if (will === 'n' || will === 'no' || will === '0') {
        return false;
    }

    // Default
    return true;
}

async function start() {
    await startQuestions();

    const filenames = await executeExportCommand();
    if (shouldImport()) await executeImportCommand(filenames);

    print('Data migration was successfully performed!');

    if (!shouldKeepBackup()) {
        print('Removing temporary export file');
        for(const filename of filenames) await removeFile(filename);
    }

    process.exit();
}

start();