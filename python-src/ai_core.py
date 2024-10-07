from fastapi import FastAPI
import threading
import time
from pydantic import BaseModel
from typing import Any, List

from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

import json
import asyncio
import traceback

import transformers
import torch
# from huggingface_hub import login
# login()


TIME_SLEEP = 0.25
MAX_SLEEP = int(120 * 1 / TIME_SLEEP)
# Shared object class
class SharedObject:
    def __init__(self):
        self.busy = False
        self.instruct = None
        self.result = None
        self.timeout = False
        self.lock = threading.Lock()
    
    def write_instruct(self, data: Any):
        with self.lock:
            self.instruct = data
    
    def read_instruct(self):
        with self.lock:
            return self.instruct
    def isBusy(self):
        with self.lock:
            return self.busy
    def setBusy(self, newStatus):
        with self.lock:
            self.busy = newStatus if newStatus == True else False
    def write_result(self, text: Any):
        with self.lock:
            self.result = text
    def read_result(self):
        with self.lock:
            return self.result

    def isTimeout(self):
        with self.lock:
            return self.timeout
    def setTimeout(self, newStatus):
        with self.lock:
            self.timeout = newStatus if newStatus == True else False

# FastAPI setup
app = FastAPI()
shared_object = SharedObject()

class Instruct(BaseModel):
    role: str
    content: str

class Job(BaseModel):
    instruct: List[Instruct] 
    # info: object
    key: str # = 'statistr'

@app.post("/generate-with-prompt")
async def generate_with_prompt(job : Job, request: Request) -> JSONResponse:
    # async with lock:
    if job.key != 'statistr':
        return JSONResponse(content={"error": "Unauthorized"}, status_code=401)
    # global busy
    if shared_object.isBusy():
        return JSONResponse(content={"data": "server is busy"}, status_code=503)
    
    shared_object.setBusy(True)
    response = {
            "status": False,
            "data": "Timeout"
        }
    try:
        shared_object.write_instruct(job.instruct)
        
        for i in range(MAX_SLEEP):
            result = shared_object.read_result()
            if result != None:
                response = {
                    "status": True,
                    "data": result
                }
                shared_object.write_result(None)
                break
            if i == MAX_SLEEP - 1:
                shared_object.setTimeout(True)
            await asyncio.sleep(TIME_SLEEP)
        

    except Exception as e :
        # print(e)
        error_ = traceback.print_exc()
        response = {
            "status": False,
            "data": error_
        }
    finally:
        shared_object.setBusy(False)

    # print(response)
    json_response = jsonable_encoder(response)

    return JSONResponse(content=json_response)

@app.get("/simple-chat")
async def simple_chat(ques: str) -> JSONResponse:
    base_instruct = [
        {"role": "system", "content": "You are a helpful assistant named Statistr. Please respond to user requests in a natural, human-like voice for readability and clarity."},
        {"role": "user", "content":  f"{ques}"}
    ]
    if shared_object.isBusy():
        return JSONResponse(content={"data": "server is busy"}, status_code=503)
    
    shared_object.setBusy(True)
    
    print("start work")
    try:
        # temp_data = chat_with_llama3(base_instruct)
        shared_object.write_instruct(base_instruct)
        response = {
            "status": False,
            "data": "Timeout"
        }
        for i in range(MAX_SLEEP):
            result = shared_object.read_result()
            if result != None:
                response = {
                    "status": True,
                    "data": result
                }
                shared_object.write_result(None)
                break
            if i == MAX_SLEEP - 1:
                shared_object.setTimeout(True)
            await asyncio.sleep(TIME_SLEEP)
        
    except Exception as e :
        response = {
            "status": False,
            "data": e
        }
    # print(response)
    finally:
        print("end work")
        shared_object.setBusy(False)
        
    json_response = jsonable_encoder(response)
    return JSONResponse(content=json_response)

# Function executed by second thread
def read_and_process(shared_obj: SharedObject):

    if torch.cuda.is_available():
        device = "cuda:0"
    else:
        device = "cpu"

    device = torch.device(device)
    model_id = "meta-llama/Meta-Llama-3-8B-Instruct"
    pipeline = transformers.pipeline(
        "text-generation",
        model=model_id,
        model_kwargs={"torch_dtype": torch.bfloat16},
        device="cuda",
    )

    terminators = [
        pipeline.tokenizer.eos_token_id,
        pipeline.tokenizer.convert_tokens_to_ids("<|eot_id|>")
    ]

    while True:
        instruct = shared_obj.read_instruct()
        if instruct != None:
            prompt = pipeline.tokenizer.apply_chat_template(
                instruct, 
                tokenize=False, 
                add_generation_prompt=True
            )
            with torch.no_grad():
                # out = pipeline(
                #     prompt,
                #     max_new_tokens=2048,
                #     eos_token_id=terminators,
                #     do_sample=True,
                #     temperature=0.01,
                #     top_p=0.99,
                #     pad_token_id=128001
                # )
                out = pipeline(
                    prompt,
                    max_new_tokens=2048,
                    eos_token_id=terminators,
                    do_sample=False,
                    pad_token_id=128001
                )
                if shared_obj.isTimeout():
                    shared_obj.write_result(None)
                    shared_obj.setTimeout(False)
                else:
                    shared_obj.write_result(out[0]["generated_text"][len(prompt):])
                    shared_obj.write_instruct(None)
                del out
                torch.cuda.empty_cache()
        time.sleep(TIME_SLEEP)

# Function to run FastAPI in a separate thread
def run_server():
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

# Create and start threads
server_thread = threading.Thread(target=run_server)
processing_thread = threading.Thread(target=read_and_process, args=(shared_object,))

server_thread.start()
processing_thread.start()

# Join threads
server_thread.join()
processing_thread.join()
