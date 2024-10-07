const USERNAME = null; 
const PASSWORD = null;
const HOST = null;
const PORT = null;
const DB = null;
const AUTH_DB = null;


const JOB_STATUS = {
    IN_QUEUE: "IN_QUEUE",
    IN_PROCESS: "IN_PROCESS",
    TIMEOUT: "TIMEOUT",
    ERROR: "ERROR",
    SUCCESS: "SUCCESS"
}
const PROMPT_STATUS = {
    ACTIVE: "ACTIVE",
    DEACTIVE: "DEACTIVE"
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function insertPrompt( prompt){
}
async function getPrompt(){
}
async function insertJob(prompt_id, context, expanded_instruct = [], info, priority_level, exp_time){
}
async function updateJob(job_id, job_data){

}
async function getJobResult(job_id){

}
async function getJobInQueue(priority_level = 0){
}
module.exports = {
    insertPrompt, getPrompt, insertJob, updateJob, getJobResult, getJobInQueue, JOB_STATUS
}
