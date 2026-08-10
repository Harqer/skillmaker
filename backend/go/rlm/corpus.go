package rlm

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"
)

// Corpus is the full RLM environment: the complete corpus text P plus the
// page map it was built from. There is no silent truncation at this layer —
// the entire file content becomes P.
type Corpus struct {
	// P is the full corpus text exposed to the sandbox as variable P.
	P string
	// Pages maps a URL to its markdown when the source file was a JSON
	// {url: markdown} object; nil for plain-text corpora.
	Pages map[string]string
	// Offsets records the [start, end) byte range of each page inside P
	// so the knowledge graph can attribute sections back to their Doc.
	Offsets map[string][2]int
	// PageOrder is the deterministic page order used to build P.
	PageOrder []string
}

// LoadCorpus reads a corpus file into a Corpus. JSON objects are treated as
// {url: markdown} page maps; any other content is treated as plain markdown.
func LoadCorpus(path string) (*Corpus, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("cannot read corpus %s: %w", path, err)
	}
	if len(data) == 0 {
		return nil, fmt.Errorf("corpus %s is empty", path)
	}

	var pages map[string]string
	if json.Unmarshal(data, &pages) == nil && pages != nil {
		return BuildCorpus(pages), nil
	}

	// Plain-text corpus: single "page".
	text := string(data)
	return &Corpus{
		P:         text,
		Pages:     map[string]string{"": text},
		Offsets:   map[string][2]int{"": {0, len(text)}},
		PageOrder: []string{""},
	}, nil
}

// BuildCorpus assembles the full P from a page map with page-aware headings,
// deterministic order, and byte offsets per page.
func BuildCorpus(pages map[string]string) *Corpus {
	order := make([]string, 0, len(pages))
	for url := range pages {
		order = append(order, url)
	}
	sort.Strings(order)

	var b strings.Builder
	offsets := make(map[string][2]int, len(order))
	for _, url := range order {
		start := b.Len()
		fmt.Fprintf(&b, "\n## Page: %s\n\n", url)
		b.WriteString(pages[url])
		b.WriteString("\n")
		offsets[url] = [2]int{start, b.Len()}
	}

	copied := make(map[string]string, len(pages))
	for k, v := range pages {
		copied[k] = v
	}
	return &Corpus{
		P:         b.String(),
		Pages:     copied,
		Offsets:   offsets,
		PageOrder: order,
	}
}

// ChunkP partitions P into overlapping chunks, mirroring rlm_engine's
// chunk_p(chunk_size, overlap) semantics.
func (c *Corpus) ChunkP(chunkSize, overlap int) []string {
	if chunkSize <= 0 {
		chunkSize = 40000
	}
	if overlap < 0 {
		overlap = 0
	}
	if overlap >= chunkSize {
		overlap = chunkSize / 2
	}
	n := len(c.P)
	var chunks []string
	i := 0
	for i < n {
		end := i + chunkSize
		if end > n {
			end = n
		}
		chunks = append(chunks, c.P[i:end])
		if end == n {
			break
		}
		i += chunkSize - overlap
	}
	return chunks
}
