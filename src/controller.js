const express = require('express');
const multer = require('multer');
const upload = multer();
const { insertPrompt, getPrompt, insertJob, updateJob, getJobResult, getJobInQueue, JOB_STATUS } = require("./db");

const app = express();
const port = 3000;
app.use(express.json());

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
//
var AI_CORE_WORK_INDEX = 0;
const AI_CORE_LIST = [
    {
        name: "core_00",
        ref: "https://ai-core-00.munki.ai/generate-with-prompt",
        ready: true
    }, {
        name: "core_01",
        ref: "https://ai-core-01.munki.ai/generate-with-prompt",
        ready: true
    }, {
        name: "core_02",
        ref: "https://ai-core-02.munki.ai/generate-with-prompt",
        ready: true
    }, {
        name: "core_03",
        ref: "https://ai-core-03.munki.ai/generate-with-prompt",
        ready: true
    }
];
const LOCAL_STORAGE = {
    prompts: [],
    model_list: {
        "llama3-instruct": "llama3-instruct"
    },
    session_jobs: 0,
    session_jobs_process: 0
}
const JOB_MEMORY = {
    current: []
}

// GET endpoint
app.get('/api/job-result', async (req, res) => {
    // console.log(req.query);
    const { job_id } = req.query;
    const data = await getJobResult(job_id);
    return res.json(data);
});
app.get('/api/job-in-queue', async (req, res) => {
    // console.log(req.query);
    const {priority_level} = req;
    const data = await getJobInQueue((priority_level && priority_level > 0) ? priority_level : 0);
    return res.json({"current_job_size": data.length});
});

// POST endpoint
app.post('/api/submit-job', upload.none(), async (req, res) => {
    const { prompt_id, context, info, priority_level, expanded_instruct, exp_time } = req.body;
    // console.log(req.body);
    // check prompt
    if ((LOCAL_STORAGE.prompts.filter(item => item._id == prompt_id)).length > 0 || (LOCAL_STORAGE.prompts.filter(item => item._id.toString() == prompt_id)).length > 0) {
        const data = await insertJob(prompt_id, JSON.parse(context), expanded_instruct ? JSON.parse(expanded_instruct) : [], JSON.parse(info), Number(priority_level), Number(exp_time));
        return res.json(data);
    } else {
        return res.status(404).json({ description: "Model not found" });
    }

});

// POST endpoint
app.post('/api/submit-prompt', upload.none(), async (req, res) => {
    const { type, model, instruct, description, name } = req.body;
    const data = await insertPrompt({ type: type, model: model, instruct: JSON.parse(instruct), name: name, description: description });
    LOCAL_STORAGE.prompts = (await getPrompt())["data"];
    return res.json(data);
});

app.get('/api/prompts', async (req, res) => {
    return res.json(LOCAL_STORAGE.prompts);
});


// distribute job space
const handler_job = async (worker, job, job_context_key) => {
    worker.ready = false;

    var prompt_selected_list = (LOCAL_STORAGE.prompts.filter(item => item._id == job.prompt_id));
    // console.log(prompt_selected)
    try {
        if (prompt_selected_list.length > 0) {
            // var prompt_selected = prompt_selected[0];
            var prompt_selected = JSON.parse(JSON.stringify(prompt_selected_list[0]));
            if (prompt_selected.model == LOCAL_STORAGE.model_list['llama3-instruct']) {
    
    
                // console.log("Prompt Selected: ", prompt_selected);
                var temp_job = prompt_selected.instruct.map(item => {
                    for (var job_key of job_context_key) {
                        // console.log("JOB Context", job.context[job_key]);
                        item["content"] = item["content"].replace(job_key, job.context[job_key]);
                    }
                    return item;
                });
                if (job.expanded_instruct && job.expanded_instruct.length > 0) {
                    temp_job = temp_job.concat(job.expanded_instruct);
                }
    
                var response = await fetch(worker.ref, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        key: "statistr",
                        instruct: temp_job
                    })
                });
                temp_job = [];
                if (response.status == 200) {
                    var data = await response.json();
                    // console.log(data);
                    if (data["status"]) {
                        await updateJob(job["_id"], {
                            status: JOB_STATUS.SUCCESS,
                            result: data["data"],
                            worker: worker.name
                        });
                    } else if (data["data"] != 'Timeout') {
                        await updateJob(job["_id"], {
                            status: JOB_STATUS.ERROR,
                            log: data,
                            worker: worker.name
                        });
                    } else if (data["data"] == 'Timeout') {
                        await updateJob(job["_id"], {
                            status: JOB_STATUS.ERROR,
                            log: data["data"],
                            worker: worker.name
                        });
                    }
                } else {
                    console.log("response 173", response);
                }
    
            } else {
            }
        }
    } catch (error) {
        console.log("error 179, ", error);
    } finally {
        worker.ready = true;
        LOCAL_STORAGE.session_jobs_process += 1;
    }
}
const distribute_jobs = async (session_index) => {
    console.log("Start session no ", session_index);
    const jobs = await getJobInQueue();
    LOCAL_STORAGE.session_jobs = jobs.length;
    console.log("Jobs Length ", jobs.length);
    for (var job of jobs) {
        //select worker
        var job_context_key = Object.keys(job.context);

        if (!(job.context && job_context_key.length > 0)) {
            continue;
        }
        // console.log(job.context);
        var worker = null;
        for (let index = 0; index < AI_CORE_LIST.length; index++) {
            if (AI_CORE_WORK_INDEX > AI_CORE_LIST.length - 1) {
                AI_CORE_WORK_INDEX = 0;
            }
            if (index < AI_CORE_WORK_INDEX) {
                continue;
            }  
            worker = AI_CORE_LIST[index];
            if (worker.ready) {
                AI_CORE_WORK_INDEX = index + 1;
                break;
            } else {
                worker = null;
            }
        }
        console.log("AI_CORE_WORK_INDEX ", AI_CORE_WORK_INDEX);
        if (worker != null) {
            handler_job(worker, job, job_context_key);
        } else {
            LOCAL_STORAGE.session_jobs_process += 1;
        }
    }
    while (LOCAL_STORAGE.session_jobs_process < LOCAL_STORAGE.session_jobs) {
        await sleep(500);
    }
    console.log("End session no ", session_index);
    LOCAL_STORAGE.session_jobs_process = 0;
    LOCAL_STORAGE.session_jobs = 0;
}

const system_loop = async () => {
    // load prompts
    LOCAL_STORAGE.prompts = (await getPrompt())["data"];
    var sessionIndex = 0;
    while (true) {
        await distribute_jobs(sessionIndex);
        if(sessionIndex > 1000000){
            sessionIndex = 0;
        } else {
            sessionIndex += 1;
        }
        await sleep(1500);
    }
}
system_loop();


// Start the server
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
