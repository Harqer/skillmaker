package rlm

import (
	"math"
	"regexp"
	"sort"
	"strings"
)

// Node is a knowledge-graph node. The lattice is:
//
//	Doc -> Section -> Chunk   (HAS_SECTION / HAS_CHUNK)
//	Chunk -MENTIONS-> Entity
//	Doc -RELATED-> Doc         (shared entities)
type Node struct {
	ID    string `json:"id"`
	Type  string `json:"type"` // doc | section | chunk | entity
	Label string `json:"label,omitempty"`
	URL   string `json:"url,omitempty"`
	Text  string `json:"text,omitempty"`
}

// Graph is the full G environment exposed to the sandbox. All methods are
// deterministic: iteration order is sorted by node ID, results tie-break by
// node ID.
type Graph struct {
	Nodes map[string]*Node
	Edges map[string][]string // adjacency: nodeID -> sorted neighbor IDs

	chunkIDs    []string
	chunkText   map[string]string
	docFreq     map[string]int
	totalChunks int
}

var (
	headingRe = regexp.MustCompile(`(?m)^(#{1,6})\s+(.+)$`)
	entityRe  = regexp.MustCompile(`\b[A-Z][a-zA-Z0-9_]{2,}\b`)
	tokenRe   = regexp.MustCompile(`[a-zA-Z0-9]+`)
	stopwords = map[string]bool{
		"the": true, "and": true, "for": true, "with": true, "from": true,
		"this": true, "that": true, "are": true, "was": true, "were": true,
		"has": true, "have": true, "not": true, "but": true, "you": true,
		"your": true, "into": true, "them": true, "they": true, "can": true,
		"will": true, "also": true, "its": true, "all": true, "any": true,
		"use": true, "using": true, "than": true, "then": true, "when": true,
		"each": true, "may": true,
	}
)

// BuildGraph constructs G from a corpus.
func BuildGraph(c *Corpus) *Graph {
	g := &Graph{
		Nodes:     map[string]*Node{},
		Edges:     map[string][]string{},
		chunkText: map[string]string{},
		docFreq:   map[string]int{},
	}

	docByURL := map[string]*Node{}
	docs := []*Node{}
	for i, url := range c.PageOrder {
		docID := "doc:" + itoa(i)
		title := url
		if title == "" {
			title = "document"
		}
		node := &Node{ID: docID, Type: "doc", Label: title, URL: url, Text: c.Pages[url]}
		g.Nodes[docID] = node
		docByURL[url] = node
		docs = append(docs, node)
	}

	// Sections per doc, then chunks per section.
	for _, doc := range docs {
		docID := doc.ID
		text := doc.Text
		headings := headingRe.FindAllStringSubmatchIndex(text, -1)
		bounds := make([][2]int, 0, len(headings)+1)
		names := []string{}
		if len(headings) == 0 {
			bounds = append(bounds, [2]int{0, len(text)})
			names = append(names, "")
		} else {
			for i, h := range headings {
				start := h[0]
				name := text[h[3]:h[4]]
				bounds = append(bounds, [2]int{start, 0})
				names = append(names, name)
				if i+1 < len(headings) {
					bounds = append(bounds, [2]int{0, 0})
				}
			}
			for i := range bounds {
				if i+1 < len(headings) {
					bounds[i][1] = headings[i+1][0]
				} else {
					bounds[i][1] = len(text)
				}
			}
			// Drop the leading (0,0) placeholder pair mismatch by rebuilding.
			bounds = bounds[:0]
			names = names[:0]
			for i, h := range headings {
				end := len(text)
				if i+1 < len(headings) {
					end = headings[i+1][0]
				}
				bounds = append(bounds, [2]int{h[0], end})
				names = append(names, text[h[3]:h[4]])
			}
		}

		for j, b := range bounds {
			sectionText := text[b[0]:b[1]]
			sectionID := "section:" + docID + ":" + itoa(j)
			sec := &Node{ID: sectionID, Type: "section", Label: names[j], URL: doc.URL, Text: sectionText}
			g.Nodes[sectionID] = sec
			g.addEdge(docID, sectionID)

			chunks := splitChunks(sectionText, 2000)
			for k, chunkText := range chunks {
				chunkID := "chunk:" + sectionID + ":" + itoa(k)
				g.Nodes[chunkID] = &Node{ID: chunkID, Type: "chunk", Label: names[j], URL: doc.URL, Text: chunkText}
				g.addEdge(sectionID, chunkID)
				g.chunkIDs = append(g.chunkIDs, chunkID)
				g.chunkText[chunkID] = chunkText

				// MENTIONS -> entities.
				seen := map[string]bool{}
				for _, m := range entityRe.FindAllString(chunkText, -1) {
					label := strings.ToLower(m)
					if seen[label] {
						continue
					}
					seen[label] = true
					entityID := "entity:" + label
					if _, ok := g.Nodes[entityID]; !ok {
						g.Nodes[entityID] = &Node{ID: entityID, Type: "entity", Label: m}
					}
					g.addEdge(chunkID, entityID)
				}
			}
		}
	}

	// RELATED edges between docs sharing entities.
	docEntities := map[string][]string{}
	for _, chunkID := range g.chunkIDs {
		secID := g.parentOf(chunkID)
		docID := g.parentOf(secID)
		for _, nid := range g.Edges[chunkID] {
			if n := g.Nodes[nid]; n != nil && n.Type == "entity" {
				docEntities[docID] = append(docEntities[docID], nid)
			}
		}
	}
	for docA := range docEntities {
		for docB := range docEntities {
			if docA >= docB {
				continue
			}
			if overlapCount(docEntities[docA], docEntities[docB]) >= 1 {
				g.addEdge(docA, docB)
			}
		}
	}

	g.indexChunks()
	return g
}

func (g *Graph) addEdge(a, b string) {
	if a == b {
		return
	}
	for _, n := range g.Edges[a] {
		if n == b {
			return
		}
	}
	g.Edges[a] = append(g.Edges[a], b)
	g.Edges[b] = append(g.Edges[b], a)
}

func (g *Graph) parentOf(nodeID string) string {
	parts := strings.Split(nodeID, ":")
	if len(parts) < 2 {
		return ""
	}
	switch parts[0] {
	case "chunk":
		// chunk:section:doc:N:M:K -> section:doc:N:M:K
		return "section:" + strings.Join(parts[1:], ":")
	case "section":
		// section:doc:N:M -> doc:N
		// doc part is "doc:N"; everything up to the final segment.
		return strings.Join(parts[1:len(parts)-1], ":")
	}
	return ""
}

// indexChunks builds the BM25 inverted index over chunk text.
func (g *Graph) indexChunks() {
	g.docFreq = map[string]int{}
	for _, chunkID := range g.chunkIDs {
		seen := map[string]bool{}
		for _, tok := range tokenize(g.chunkText[chunkID]) {
			if seen[tok] {
				continue
			}
			seen[tok] = true
			g.docFreq[tok]++
		}
	}
	g.totalChunks = len(g.chunkIDs)
}

func (g *Graph) sortedEdges(nodeID string) []string {
	out := append([]string(nil), g.Edges[nodeID]...)
	sort.Strings(out)
	return out
}

// Summary returns the graph census for the sandbox G.summary().
func (g *Graph) Summary() map[string]any {
	counts := map[string]int{}
	for _, n := range g.Nodes {
		counts[n.Type]++
	}
	return map[string]any{
		"documents":  counts["doc"],
		"sections":   counts["section"],
		"chunks":     counts["chunk"],
		"entities":   counts["entity"],
		"nodes":      len(g.Nodes),
		"edge_count": edgeCount(g.Edges),
	}
}

func edgeCount(edges map[string][]string) int {
	total := 0
	for _, n := range edges {
		total += len(n)
	}
	return total / 2
}

// Search runs BM25 over chunks and returns the top-k ranked results with
// stable tie-breaking.
func (g *Graph) Search(query string, k int) []map[string]any {
	if k <= 0 {
		k = 5
	}
	tokens := tokenize(query)
	if len(tokens) == 0 {
		return nil
	}

	type scored struct {
		id    string
		score float64
	}
	results := make([]scored, 0, len(g.chunkIDs))
	for _, chunkID := range g.chunkIDs {
		text := g.chunkText[chunkID]
		score := 0.0
		tf := map[string]int{}
		for _, tok := range tokenize(text) {
			tf[tok]++
		}
		for _, tok := range tokens {
			f := tf[tok]
			if f == 0 {
				continue
			}
			idf := math.Log(1 + (float64(g.totalChunks)-float64(g.docFreq[tok])+0.5)/
				(float64(g.docFreq[tok])+0.5))
			score += float64(f) * idf
		}
		if score > 0 {
			results = append(results, scored{chunkID, score})
		}
	}
	sort.Slice(results, func(i, j int) bool {
		if results[i].score != results[j].score {
			return results[i].score > results[j].score
		}
		return results[i].id < results[j].id
	})
	if len(results) > k {
		results = results[:k]
	}

	out := make([]map[string]any, 0, len(results))
	for _, r := range results {
		out = append(out, map[string]any{
			"node":  r.id,
			"text":  g.chunkText[r.id],
			"score": round3(r.score),
		})
	}
	return out
}

// Get returns the node with the given ID, or nil.
func (g *Graph) Get(nodeID string) *Node {
	return g.Nodes[nodeID]
}

// Neighbors returns nodes reachable within `depth` hops of nodeID.
func (g *Graph) Neighbors(nodeID string, depth int) map[string]any {
	if depth <= 0 {
		depth = 1
	}
	seen := map[string]bool{nodeID: true}
	frontier := []string{nodeID}
	for d := 0; d < depth && len(frontier) > 0; d++ {
		var next []string
		for _, id := range frontier {
			for _, n := range g.sortedEdges(id) {
				if !seen[n] {
					seen[n] = true
					next = append(next, n)
				}
			}
		}
		frontier = next
	}
	nodes := []map[string]any{}
	for _, id := range sortedKeys(seen) {
		nodes = append(nodes, nodeJSON(g.Nodes[id]))
	}
	return map[string]any{"nodes": nodes}
}

// Subgraph returns the nodes and edges induced by the seeds and their
// depth-neighborhood.
func (g *Graph) Subgraph(seedIDs []string, depth int) map[string]any {
	if depth <= 0 {
		depth = 2
	}
	seen := map[string]bool{}
	for _, s := range seedIDs {
		if g.Nodes[s] != nil {
			seen[s] = true
		}
	}
	frontier := []string{}
	for s := range seen {
		frontier = append(frontier, s)
	}
	for d := 0; d < depth && len(frontier) > 0; d++ {
		var next []string
		for _, id := range frontier {
			for _, n := range g.sortedEdges(id) {
				if !seen[n] {
					seen[n] = true
					next = append(next, n)
				}
			}
		}
		frontier = next
	}
	nodes := []map[string]any{}
	edges := [][2]string{}
	ids := sortedKeys(seen)
	for _, id := range ids {
		nodes = append(nodes, nodeJSON(g.Nodes[id]))
		for _, n := range g.sortedEdges(id) {
			if seen[n] && id < n {
				edges = append(edges, [2]string{id, n})
			}
		}
	}
	return map[string]any{"nodes": nodes, "edges": edges}
}

// Find looks up nodes by exact label/URL/type match.
func (g *Graph) Find(label string, props map[string]string) []*Node {
	out := []*Node{}
	for _, id := range sortedNodeIDs(g.Nodes) {
		n := g.Nodes[id]
		if props != nil {
			if v, ok := props["type"]; ok && v != "" && n.Type != v {
				continue
			}
			if v, ok := props["url"]; ok && v != "" && n.URL != v {
				continue
			}
			if v, ok := props["label"]; ok && v != "" && n.Label != v {
				continue
			}
		}
		if label != "" && !strings.EqualFold(n.Label, label) {
			continue
		}
		out = append(out, n)
	}
	return out
}

func nodeJSON(n *Node) map[string]any {
	if n == nil {
		return map[string]any{}
	}
	return map[string]any{
		"id":    n.ID,
		"type":  n.Type,
		"label": n.Label,
		"url":   n.URL,
		"text":  truncate(n.Text, 800),
	}
}

func splitChunks(text string, size int) []string {
	text = strings.TrimSpace(text)
	if text == "" {
		return nil
	}
	if len(text) <= size {
		return []string{text}
	}
	var chunks []string
	for len(text) > size {
		cut := size
		if idx := strings.LastIndexAny(text[:size], "\n."); idx > size/2 {
			cut = idx + 1
		}
		chunks = append(chunks, text[:cut])
		text = text[cut:]
	}
	if text != "" {
		chunks = append(chunks, text)
	}
	return chunks
}

func tokenize(s string) []string {
	var out []string
	for _, t := range tokenRe.FindAllString(strings.ToLower(s), -1) {
		if stopwords[t] || len(t) < 2 {
			continue
		}
		out = append(out, t)
	}
	return out
}

func overlapCount(a, b []string) int {
	set := map[string]bool{}
	for _, x := range a {
		set[x] = true
	}
	n := 0
	for _, x := range b {
		if set[x] {
			n++
		}
	}
	return n
}

func sortedKeys(m map[string]bool) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

func sortedNodeIDs(m map[string]*Node) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

func round3(v float64) float64 {
	return math.Round(v*1000) / 1000
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}

func itoa(i int) string {
	if i == 0 {
		return "0"
	}
	neg := i < 0
	if neg {
		i = -i
	}
	var b [20]byte
	pos := len(b)
	for i > 0 {
		pos--
		b[pos] = byte('0' + i%10)
		i /= 10
	}
	if neg {
		pos--
		b[pos] = '-'
	}
	return string(b[pos:])
}
