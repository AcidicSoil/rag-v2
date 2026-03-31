import type { RagCandidate, RagDocument, RagEvidenceBlock } from "./contracts";
import type {
  CorpusInspectInput,
  CorpusInspectOutput,
  RagAnswerInput,
  RagAnswerOutput,
  RagSearchInput,
  RagSearchOutput,
  RerankOnlyInput,
  RerankOnlyOutput,
} from "../mcp/contracts";

export interface RagLoadedCorpus {
  documents: Array<RagDocument>;
  candidates?: Array<RagCandidate>;
  fileCount: number;
  estimatedTokens?: number;
  chunkCount?: number;
}

export interface RagDocumentLoader {
  load(input: {
    documents?: RagAnswerInput["documents"] | RagSearchInput["documents"] | CorpusInspectInput["documents"];
    paths?: RagAnswerInput["paths"] | RagSearchInput["paths"] | CorpusInspectInput["paths"];
    chunks?: RagAnswerInput["chunks"] | RagSearchInput["chunks"] | CorpusInspectInput["chunks"];
  }): Promise<RagLoadedCorpus>;
}

export interface RagRetriever {
  search(input: {
    query: string;
    corpus: RagLoadedCorpus;
    options?: RagAnswerInput["retrieval"] | RagSearchInput["retrieval"];
  }): Promise<Array<RagCandidate>>;
}

export interface RagAnswerComposer {
  answer(input: {
    query: string;
    corpus: RagLoadedCorpus;
    evidence: Array<RagEvidenceBlock>;
    route: string;
    groundingMode: RagAnswerInput["groundingMode"];
  }): Promise<Pick<RagAnswerOutput, "answer" | "confidence" | "unsupportedClaimWarnings">>;
}

export interface RagInspector {
  inspect(input: { corpus: RagLoadedCorpus }): Promise<CorpusInspectOutput>;
}

export interface RagMcpRuntime {
  loader: RagDocumentLoader;
  retriever: RagRetriever;
  answerComposer: RagAnswerComposer;
  inspector: RagInspector;
}

export interface RagToolHandlerSet {
  ragAnswer(input: RagAnswerInput): Promise<RagAnswerOutput>;
  ragSearch(input: RagSearchInput): Promise<RagSearchOutput>;
  corpusInspect(input: CorpusInspectInput): Promise<CorpusInspectOutput>;
  rerankOnly(input: RerankOnlyInput): Promise<RerankOnlyOutput>;
}
