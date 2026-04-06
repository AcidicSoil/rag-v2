import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createDefaultMcpRuntime } from "../packages/mcp-server/src/defaultRuntime";
import { createMcpToolHandlers } from "../packages/mcp-server/src/handlers";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "rag-v2-mcp-"));
  const homeTempRoot = await mkdtemp(path.join(os.homedir(), "rag-v2-home-"));

  try {
    await writeFile(
      path.join(tempRoot, "architecture.md"),
      "# Architecture\nThe session service uses PostgreSQL for durable state.\n\n## Analytics\nAnalytics uses ClickHouse for dashboards.\n",
      "utf8"
    );
    await mkdir(path.join(tempRoot, "docs"));
    await writeFile(
      path.join(tempRoot, "docs", "tradeoffs.txt"),
      "Tradeoff summary\nHigher write latency is accepted to preserve failover consistency.\n",
      "utf8"
    );
    await mkdir(path.join(tempRoot, "node_modules"));
    await writeFile(
      path.join(tempRoot, "node_modules", "ignored.txt"),
      "Ignored dependency text\nThis file should not be ingested by corpus loading.\n",
      "utf8"
    );
    await mkdir(path.join(tempRoot, ".git"));
    await writeFile(
      path.join(tempRoot, ".git", "ignored.md"),
      "Ignored git metadata\nThis file should not be ingested by corpus loading.\n",
      "utf8"
    );

    await writeFile(
      path.join(homeTempRoot, "tilde-path.md"),
      "Path expansion proof\nThe deployment lives under the user's home projects directory.\n",
      "utf8"
    );

    const handlers = createMcpToolHandlers(createDefaultMcpRuntime());

    const browse = await handlers.filesystemBrowse({
      path: tempRoot,
      recursive: true,
      maxDepth: 2,
      maxEntries: 20,
    });
    assert(browse.exists, "Expected filesystem_browse to resolve the temporary root.");
    assert(browse.type === "directory", "Expected filesystem_browse to report a directory.");
    assert(
      browse.entries.some((entry) => entry.name === "architecture.md"),
      "Expected filesystem_browse to include the architecture file."
    );
    assert(
      browse.entries.some((entry) => entry.name === "docs" && entry.type === "directory"),
      "Expected filesystem_browse to include the docs directory."
    );
    assert(
      browse.entries.some((entry) => entry.name === "node_modules" && entry.type === "directory"),
      "Expected filesystem_browse to include node_modules when browsing."
    );
    assert(browse.directoryCount === 2, "Expected filesystem_browse to summarize two visible directories.");
    assert(browse.fileCount === 1, "Expected filesystem_browse to summarize one visible file at the root.");
    assert(
      browse.topExtensions?.some((entry) => entry.extension === ".md" && entry.count === 1),
      "Expected filesystem_browse to summarize the markdown extension count."
    );

    const info = await handlers.fileInfo({
      path: path.join(tempRoot, "architecture.md"),
    });
    assert(info.exists, "Expected file_info to resolve the architecture file.");
    assert(info.type === "file", "Expected file_info to report a file.");
    assert(info.extension === ".md", "Expected file_info to report the markdown extension.");
    assert(info.textLike === true, "Expected file_info to mark architecture.md as text-like.");

    const dirInfo = await handlers.fileInfo({
      path: tempRoot,
    });
    assert(dirInfo.exists, "Expected file_info to resolve the temporary root directory.");
    assert(dirInfo.type === "directory", "Expected file_info to report a directory.");
    assert(dirInfo.childCount === 3, "Expected file_info to report three visible children at the root.");
    assert(dirInfo.directoryCount === 2, "Expected file_info to report two visible directories.");
    assert(dirInfo.fileCount === 1, "Expected file_info to report one visible file.");

    const excerpt = await handlers.readFile({
      path: path.join(tempRoot, "architecture.md"),
      startLine: 0,
      maxLines: 2,
      maxChars: 200,
    });
    assert(excerpt.exists, "Expected read_file to resolve the architecture file.");
    assert(
      excerpt.content?.includes("session service uses PostgreSQL"),
      "Expected read_file to return the requested text excerpt."
    );

    const inspect = await handlers.corpusInspect({
      paths: [tempRoot],
    });
    assert(inspect.fileCount === 2, "Expected filesystem corpus inspection to load two text files.");

    const search = await handlers.ragSearch({
      query: "failover consistency tradeoff",
      paths: [tempRoot],
    });
    assert(search.candidates.length > 0, "Expected filesystem rag_search to return candidates.");
    assert(
      search.candidates.some((candidate) => candidate.sourceName.includes("tradeoffs.txt")),
      "Expected filesystem rag_search to include the matching tradeoffs file."
    );
    assert(
      !search.candidates.some((candidate) => candidate.sourceName.includes("ignored.txt")),
      "Expected filesystem rag_search to ignore files under node_modules during corpus loading."
    );

    const answer = await handlers.ragAnswer({
      query: "What database does the session service use?",
      paths: [tempRoot],
    });
    assert(answer.evidence.length > 0, "Expected filesystem rag_answer to produce evidence.");
    assert(
      answer.evidence.some((block) => block.fileName.includes("architecture.md")),
      "Expected filesystem rag_answer to cite the architecture file."
    );

    const tildePath = homeTempRoot.replace(os.homedir(), "~");
    const tildeBrowse = await handlers.filesystemBrowse({
      path: tildePath,
      recursive: false,
      maxEntries: 10,
    });
    assert(tildeBrowse.exists, "Expected tilde-expanded filesystem_browse to resolve.");
    assert(
      tildeBrowse.resolvedPath === homeTempRoot,
      "Expected tilde-expanded filesystem_browse to report the resolved home path."
    );

    const tildeInspect = await handlers.corpusInspect({
      paths: [tildePath],
    });
    assert(tildeInspect.fileCount === 1, "Expected tilde-expanded corpus inspection to load one text file.");

    const tildeSearch = await handlers.ragSearch({
      query: "user's home projects directory",
      paths: [tildePath],
    });
    assert(tildeSearch.candidates.length > 0, "Expected tilde-expanded rag_search to return candidates.");
    assert(
      tildeSearch.candidates.some((candidate) => candidate.sourceName.includes("tilde-path.md")),
      "Expected tilde-expanded rag_search to include the tilde-path file."
    );

    console.log("MCP filesystem smoke test passed.");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
    await rm(homeTempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`MCP filesystem smoke test failed: ${message}`);
  process.exit(1);
});
