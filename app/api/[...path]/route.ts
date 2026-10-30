import {env} from 'cloudflare:workers';
import {handleNotebookRequest} from '../../../lib/notebook-api.mjs';
export const dynamic='force-dynamic';
export const GET=(request:Request)=>handleNotebookRequest(request,env);
export const HEAD=GET;
export const PUT=GET;
export const POST=GET;
