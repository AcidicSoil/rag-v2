You are a senior developer. You produce optimized, maintainable code that follows best practices. 

Your task is to review the current codebase and fix the current issues.

Current Issue:
<issue>
{{MESSAGE}}
</issue>

Rules:
- Keep your suggestions concise and focused. Avoid unnecessary explanations or fluff. 
- Your output should be a series of specific, actionable changes.

When approaching this task:
1. Carefully review the provided code.
2. Identify the area thats raising this issue or error and provide a fix.
3. Consider best practices for the specific programming language used.

For each suggested change, provide:
1. A short description of the change (one line maximum).
2. The modified code block.

Use the following format for your output:

[Short Description]
```[language]:[path/to/file]
[code block]
```

Begin fixing the codebase provide your solutions.

My current codebase:
<current_codebase>
Project Structure:
├── README.md
├── codefetch
│   └── src.md
├── codefetch.config.mjs
├── manifest.json
├── package-lock.json
├── package.json
├── src
│   ├── config.ts
│   ├── index.ts
│   └── promptPreprocessor.ts
└── tsconfig.json


codefetch.config.mjs
```
1 | /** @type {import('codefetch').CodefetchConfig} */
2 | export default {
3 |   "projectTree": 5,
4 |   "tokenLimiter": "truncated",
5 |   "defaultPromptFile": "default.md"
6 | };
```

manifest.json
```
1 | {
2 |   "type": "plugin",
3 |   "runner": "node",
4 |   "owner": "dirty-data",
5 |   "name": "rag-v2",
6 |   "revision": 5
7 | }
```

package.json
```
1 | {
2 |   "name": "lms-plugin-rag-v2",
3 |   "version": "1.0.0",
4 |   "description": "text-embedding-nemotron-research-reasoning-qwen-1.5b-reasoning-embedding",
5 |   "main": "index.js",
6 |   "scripts": {
7 |     "dev": "lms dev",
8 |     "code": "codefetch --include-dir src -o src.md",
9 |     "push": "lms push"
10 |   },
11 |   "author": "",
12 |   "license": "ISC",
13 |   "dependencies": {
14 |     "@lmstudio/sdk": "1.4.0",
15 |     "zod": "3.24.1"
16 |   },
17 |   "devDependencies": {
18 |     "@types/node": "^20.19.25",
19 |     "codefetch": "^2.1.2"
20 |   }
21 | }
```

tsconfig.json
```
1 | {
2 |   "compilerOptions": {
3 |     "strict": true,
4 |     "module": "CommonJS",
5 |     "target": "ES2021",
6 |     "declaration": true,
7 |     "noImplicitOverride": true,
8 |     "sourceMap": true,
9 |     "declarationMap": true,
10 |     "esModuleInterop": true,
11 |     "skipLibCheck": true,
12 |     "rootDir": "src",
13 |     "outDir": "dist"
14 |   }
15 | }
```

src/config.ts
```
1 | import { createConfigSchematics } from "@lmstudio/sdk";
2 | 
3 | export const configSchematics = createConfigSchematics()
4 |   .field(
5 |     "retrievalLimit",
6 |     "numeric",
7 |     {
8 |       int: true,
9 |       min: 1,
10 |       displayName: "Retrieval Limit",
11 |       subtitle: "When retrieval is triggered, this is the maximum number of chunks to return.",
12 |       slider: { min: 1, max: 10, step: 1 },
13 |     },
14 |     3,
15 |   )
16 |   .field(
17 |     "retrievalAffinityThreshold",
18 |     "numeric",
19 |     {
20 |       min: 0.0,
21 |       max: 1.0,
22 |       displayName: "Retrieval Affinity Threshold",
23 |       subtitle: "The minimum similarity score for a chunk to be considered relevant.",
24 |       slider: { min: 0.0, max: 1.0, step: 0.01 },
25 |     },
26 |     0.5,
27 |   )
28 |   .build();
```

src/index.ts
```
1 | import { type PluginContext } from "@lmstudio/sdk";
2 | import { configSchematics } from "./config";
3 | import { preprocess } from "./promptPreprocessor";
4 | 
5 | // This is the entry point of the plugin. The main function is to register different components of
6 | // the plugin, such as promptPreprocessor, predictionLoopHandler, etc.
7 | //
8 | // You do not need to modify this file unless you want to add more components to the plugin, and/or
9 | // add custom initialization logic.
10 | 
11 | export async function main(context: PluginContext) {
12 |   // Register the configuration schematics.
13 |   context.withConfigSchematics(configSchematics);
14 |   // Register the promptPreprocessor.
15 |   context.withPromptPreprocessor(preprocess);
16 | }
```

src/promptPreprocessor.ts
```
1 | import {
2 |   text,
3 |   type Chat,
4 |   type ChatMessage,
5 |   type FileHandle,
6 |   type LLMDynamicHandle,
7 |   type PredictionProcessStatusController,
8 |   type PromptPreprocessorController,
9 | } from "@lmstudio/sdk";
10 | import { configSchematics } from "./config";
11 | 
12 | type DocumentContextInjectionStrategy = "none" | "inject-full-content" | "retrieval";
13 | 
14 | export async function preprocess(ctl: PromptPreprocessorController, userMessage: ChatMessage) {
15 |   const userPrompt = userMessage.getText();
16 |   const history = await ctl.pullHistory();
17 |   history.append(userMessage);
18 |   const newFiles = userMessage.getFiles(ctl.client).filter(f => f.type !== "image");
19 |   const files = history.getAllFiles(ctl.client).filter(f => f.type !== "image");
20 | 
21 |   if (newFiles.length > 0) {
22 |     const strategy = await chooseContextInjectionStrategy(ctl, userPrompt, newFiles);
23 |     if (strategy === "inject-full-content") {
24 |       return await prepareDocumentContextInjection(ctl, userMessage);
25 |     } else if (strategy === "retrieval") {
26 |       return await prepareRetrievalResultsContextInjection(ctl, userPrompt, files);
27 |     }
28 |   } else if (files.length > 0) {
29 |     return await prepareRetrievalResultsContextInjection(ctl, userPrompt, files);
30 |   }
31 | 
32 |   return userMessage;
33 | }
34 | 
35 | async function prepareRetrievalResultsContextInjection(
36 |   ctl: PromptPreprocessorController,
37 |   originalUserPrompt: string,
38 |   files: Array<FileHandle>,
39 | ): Promise<string> {
40 |   const pluginConfig = ctl.getPluginConfig(configSchematics);
41 |   const retrievalLimit = pluginConfig.get("retrievalLimit");
42 |   const retrievalAffinityThreshold = pluginConfig.get("retrievalAffinityThreshold");
43 | 
44 |   // process files if necessary
45 | 
46 |   const statusSteps = new Map<FileHandle, PredictionProcessStatusController>();
47 | 
48 |   const retrievingStatus = ctl.createStatus({
49 |     status: "loading",
50 |     text: `Loading an embedding model for retrieval...`,
51 |   });
52 |   const model = await ctl.client.embedding.model(
53 |     "text-embedding-nemotron-research-reasoning-qwen-1.5b-reasoning-embedding",
54 |     {
55 |       signal: ctl.abortSignal,
56 |     }
57 |   );
58 |   retrievingStatus.setState({
59 |     status: "loading",
60 |     text: `Retrieving relevant citations for user query...`,
61 |   });
62 |   const result = await ctl.client.files.retrieve(originalUserPrompt, files, {
63 |     embeddingModel: model,
64 |     // Affinity threshold: 0.6 not implemented
65 |     limit: retrievalLimit,
66 |     signal: ctl.abortSignal,
67 |     onFileProcessList(filesToProcess) {
68 |       for (const file of filesToProcess) {
69 |         statusSteps.set(
70 |           file,
71 |           retrievingStatus.addSubStatus({
72 |             status: "waiting",
73 |             text: `Process ${file.name} for retrieval`,
74 |           }),
75 |         );
76 |       }
77 |     },
78 |     onFileProcessingStart(file) {
79 |       statusSteps
80 |         .get(file)!
81 |         .setState({ status: "loading", text: `Processing ${file.name} for retrieval` });
82 |     },
83 |     onFileProcessingEnd(file) {
84 |       statusSteps
85 |         .get(file)!
86 |         .setState({ status: "done", text: `Processed ${file.name} for retrieval` });
87 |     },
88 |     onFileProcessingStepProgress(file, step, progressInStep) {
89 |       const verb = step === "loading" ? "Loading" : step === "chunking" ? "Chunking" : "Embedding";
90 |       statusSteps.get(file)!.setState({
91 |         status: "loading",
92 |         text: `${verb} ${file.name} for retrieval (${(progressInStep * 100).toFixed(1)}%)`,
93 |       });
94 |     },
95 |   });
96 | 
97 |   result.entries = result.entries.filter(entry => entry.score > retrievalAffinityThreshold);
98 | 
99 |   // inject retrieval result into the "processed" content
100 |   let processedContent = "";
101 |   const numRetrievals = result.entries.length;
102 |   if (numRetrievals > 0) {
103 |     // retrieval occured and got results
104 |     // show status
105 |     retrievingStatus.setState({
106 |       status: "done",
107 |       text: `Retrieved ${numRetrievals} relevant citations for user query`,
108 |     });
109 |     ctl.debug("Retrieval results", result);
110 |     // add results to prompt
111 |     const prefix = "The following citations were found in the files provided by the user:\n\n";
112 |     processedContent += prefix;
113 |     let citationNumber = 1;
114 |     result.entries.forEach(result => {
115 |       const completeText = result.content;
116 |       processedContent += `Citation ${citationNumber}: "${completeText}"\n\n`;
117 |       citationNumber++;
118 |     });
119 |     await ctl.addCitations(result);
120 |     const suffix =
121 |       `Use the citations above to respond to the user query, only if they are relevant. ` +
122 |       `Otherwise, respond to the best of your ability without them.` +
123 |       `\n\nUser Query:\n\n${originalUserPrompt}`;
124 |     processedContent += suffix;
125 |   } else {
126 |     // retrieval occured but no relevant citations found
127 |     retrievingStatus.setState({
128 |       status: "canceled",
129 |       text: `No relevant citations found for user query`,
130 |     });
131 |     ctl.debug("No relevant citations found for user query");
132 |     const noteAboutNoRetrievalResultsFound =
133 |       `Important: No citations were found in the user files for the user query. ` +
134 |       `In less than one sentence, inform the user of this. ` +
135 |       `Then respond to the query to the best of your ability.`;
136 |     processedContent =
137 |       noteAboutNoRetrievalResultsFound + `\n\nUser Query:\n\n${originalUserPrompt}`;
138 |   }
139 |   ctl.debug("Processed content", processedContent);
140 | 
141 |   return processedContent;
142 | }
143 | 
144 | async function prepareDocumentContextInjection(
145 |   ctl: PromptPreprocessorController,
146 |   input: ChatMessage,
147 | ): Promise<ChatMessage> {
148 |   const documentInjectionSnippets: Map<FileHandle, string> = new Map();
149 |   const files = input.consumeFiles(ctl.client, file => file.type !== "image");
150 |   for (const file of files) {
151 |     // This should take no time as the result is already in the cache
152 |     const { content } = await ctl.client.files.parseDocument(file, {
153 |       signal: ctl.abortSignal,
154 |     });
155 | 
156 |     ctl.debug(text`
157 |       Strategy: inject-full-content. Injecting full content of file '${file}' into the
158 |       context. Length: ${content.length}.
159 |     `);
160 |     documentInjectionSnippets.set(file, content);
161 |   }
162 | 
163 |   // Format the final user prompt
164 |   // TODO:
165 |   //    Make this templatable and configurable
166 |   //      https://github.com/lmstudio-ai/llmster/issues/1017
167 |   let formattedFinalUserPrompt = "";
168 | 
169 |   if (documentInjectionSnippets.size > 0) {
170 |     formattedFinalUserPrompt +=
171 |       "This is a Enriched Context Generation scenario.\n\nThe following content was found in the files provided by the user.\n";
172 | 
173 |     for (const [fileHandle, snippet] of documentInjectionSnippets) {
174 |       formattedFinalUserPrompt += `\n\n** ${fileHandle.name} full content **\n\n${snippet}\n\n** end of ${fileHandle.name} **\n\n`;
175 |     }
176 | 
177 |     formattedFinalUserPrompt += `Based on the content above, please provide a response to the user query.\n\nUser query: ${input.getText()}`;
178 |   }
179 | 
180 |   input.replaceText(formattedFinalUserPrompt);
181 |   return input;
182 | }
183 | 
184 | async function measureContextWindow(ctx: Chat, model: LLMDynamicHandle) {
185 |   const currentContextFormatted = await model.applyPromptTemplate(ctx);
186 |   const totalTokensInContext = await model.countTokens(currentContextFormatted);
187 |   const modelContextLength = await model.getContextLength();
188 |   const modelRemainingContextLength = modelContextLength - totalTokensInContext;
189 |   const contextOccupiedPercent = (totalTokensInContext / modelContextLength) * 100;
190 |   return {
191 |     totalTokensInContext,
192 |     modelContextLength,
193 |     modelRemainingContextLength,
194 |     contextOccupiedPercent,
195 |   };
196 | }
197 | 
198 | async function chooseContextInjectionStrategy(
199 |   ctl: PromptPreprocessorController,
200 |   originalUserPrompt: string,
201 |   files: Array<FileHandle>,
202 | ): Promise<DocumentContextInjectionStrategy> {
203 |   const status = ctl.createStatus({
204 |     status: "loading",
205 |     text: `Deciding how to handle the document(s)...`,
206 |   });
207 | 
208 |   const model = await ctl.client.llm.model();
209 |   const ctx = await ctl.pullHistory();
210 | 
211 |   // Measure the context window
212 |   const {
213 |     totalTokensInContext,
214 |     modelContextLength,
215 |     modelRemainingContextLength,
216 |     contextOccupiedPercent,
217 |   } = await measureContextWindow(ctx, model);
218 | 
219 |   ctl.debug(
220 |     `Context measurement result:\n\n` +
221 |       `\tTotal tokens in context: ${totalTokensInContext}\n` +
222 |       `\tModel context length: ${modelContextLength}\n` +
223 |       `\tModel remaining context length: ${modelRemainingContextLength}\n` +
224 |       `\tContext occupied percent: ${contextOccupiedPercent.toFixed(2)}%\n`,
225 |   );
226 | 
227 |   // Get token count of provided files
228 |   let totalFileTokenCount = 0;
229 |   let totalReadTime = 0;
230 |   let totalTokenizeTime = 0;
231 |   for (const file of files) {
232 |     const startTime = performance.now();
233 | 
234 |     const loadingStatus = status.addSubStatus({
235 |       status: "loading",
236 |       text: `Loading parser for ${file.name}...`,
237 |     });
238 |     let actionProgressing = "Reading";
239 |     let parserIndicator = "";
240 | 
241 |     const { content } = await ctl.client.files.parseDocument(file, {
242 |       signal: ctl.abortSignal,
243 |       onParserLoaded: parser => {
244 |         loadingStatus.setState({
245 |           status: "loading",
246 |           text: `${parser.library} loaded for ${file.name}...`,
247 |         });
248 |         // Update action names if we're using a parsing framework
249 |         if (parser.library !== "builtIn") {
250 |           actionProgressing = "Parsing";
251 |           parserIndicator = ` with ${parser.library}`;
252 |         }
253 |       },
254 |       onProgress: progress => {
255 |         loadingStatus.setState({
256 |           status: "loading",
257 |           text: `${actionProgressing} file ${file.name}${parserIndicator}... (${(
258 |             progress * 100
259 |           ).toFixed(2)}%)`,
260 |         });
261 |       },
262 |     });
263 |     loadingStatus.remove();
264 | 
265 |     totalReadTime += performance.now() - startTime;
266 | 
267 |     // tokenize file content
268 |     const startTokenizeTime = performance.now();
269 |     totalFileTokenCount += await model.countTokens(content);
270 |     totalTokenizeTime += performance.now() - startTokenizeTime;
271 |     if (totalFileTokenCount > modelRemainingContextLength) {
272 |       // Early exit if we already have too much tokens. Helps with performance when there are a lot of files.
273 |       break;
274 |     }
275 |   }
276 |   ctl.debug(`Total file read time: ${totalReadTime.toFixed(2)} ms`);
277 |   ctl.debug(`Total tokenize time: ${totalTokenizeTime.toFixed(2)} ms`);
278 | 
279 |   // Calculate total token count of files + user prompt
280 |   ctl.debug(`Original User Prompt: ${originalUserPrompt}`);
281 |   const userPromptTokenCount = (await model.tokenize(originalUserPrompt)).length;
282 |   const totalFilePlusPromptTokenCount = totalFileTokenCount + userPromptTokenCount;
283 | 
284 |   // Calculate the available context tokens
285 |   const contextOccupiedFraction = contextOccupiedPercent / 100;
286 |   const targetContextUsePercent = 0.7;
287 |   const targetContextUsage = targetContextUsePercent * (1 - contextOccupiedFraction);
288 |   const availableContextTokens = Math.floor(modelRemainingContextLength * targetContextUsage);
289 | 
290 |   // Debug log
291 |   ctl.debug("Strategy Calculation:");
292 |   ctl.debug(`\tTotal Tokens in All Files: ${totalFileTokenCount}`);
293 |   ctl.debug(`\tTotal Tokens in User Prompt: ${userPromptTokenCount}`);
294 |   ctl.debug(`\tModel Context Remaining: ${modelRemainingContextLength} tokens`);
295 |   ctl.debug(`\tContext Occupied: ${contextOccupiedPercent.toFixed(2)}%`);
296 |   ctl.debug(`\tAvailable Tokens: ${availableContextTokens}\n`);
297 | 
298 |   if (totalFilePlusPromptTokenCount > availableContextTokens) {
299 |     const chosenStrategy = "retrieval";
300 |     ctl.debug(
301 |       `Chosen context injection strategy: '${chosenStrategy}'. Total file + prompt token count: ` +
302 |         `${totalFilePlusPromptTokenCount} > ${
303 |           targetContextUsage * 100
304 |         }% * available context tokens: ${availableContextTokens}`,
305 |     );
306 |     status.setState({
307 |       status: "done",
308 |       text: `Chosen context injection strategy: '${chosenStrategy}'. Retrieval is optimal for the size of content provided`,
309 |     });
310 |     return chosenStrategy;
311 |   }
312 | 
313 |   // TODO:
314 |   //
315 |   //   Consider a more sophisticated strategy where we inject some header or summary content
316 |   //   and then perform retrieval on the rest of the content.
317 |   //
318 |   //
319 | 
320 |   const chosenStrategy = "inject-full-content";
321 |   status.setState({
322 |     status: "done",
323 |     text: `Chosen context injection strategy: '${chosenStrategy}'. All content can fit into the context`,
324 |   });
325 |   return chosenStrategy;
326 | }
```

</current_codebase>
