package rlm

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

// GeminiClient is a minimal REST client for
// models/{model}:generateContent, mirroring agent/rlm_engine._gemini_generate.
type GeminiClient struct {
	APIKey  string
	Model   string
	Timeout time.Duration
	Retries int
	HTTP    *http.Client
	baseURL string
}

// NewGeminiClient resolves the API key from GEMINI_API_KEY (canonical) or
// GOOGLE_API_KEY (alias), matching agent/config.py.
func NewGeminiClient(model string) (*GeminiClient, error) {
	key := os.Getenv("GEMINI_API_KEY")
	if key == "" {
		key = os.Getenv("GOOGLE_API_KEY")
	}
	if key == "" {
		return nil, errors.New("GEMINI_API_KEY (or GOOGLE_API_KEY) is not set")
	}
	if model == "" {
		model = "gemini-2.5-flash"
	}
	return &GeminiClient{
		APIKey:  key,
		Model:   model,
		Timeout: 120 * time.Second,
		Retries: 2,
		HTTP:    &http.Client{},
		baseURL: "https://generativelanguage.googleapis.com/v1beta/models",
	}, nil
}

type geminiContents struct {
	Role  string       `json:"role"`
	Parts []geminiPart `json:"parts"`
}

type geminiPart struct {
	Text string `json:"text"`
}

type geminiRequest struct {
	Contents         []geminiContents `json:"contents"`
	GenerationConfig map[string]any   `json:"generationConfig"`
}

type geminiResponse struct {
	Candidates []struct {
		Content struct {
			Parts []geminiPart `json:"parts"`
		} `json:"content"`
	} `json:"candidates"`
}

// Generate runs one completion. A non-empty systemInstruction is folded into
// a single user message exactly like _gemini_generate does.
func (c *GeminiClient) Generate(ctx context.Context, prompt, systemInstruction string, temperature float64) (string, error) {
	if c.Timeout <= 0 {
		c.Timeout = 120 * time.Second
	}
	ctx, cancel := context.WithTimeout(ctx, c.Timeout)
	defer cancel()

	userText := prompt
	if systemInstruction != "" {
		userText = "System Instruction:\n" + systemInstruction + "\n\nTask:\n" + prompt
	}
	body := geminiRequest{
		Contents: []geminiContents{{Role: "user", Parts: []geminiPart{{Text: userText}}}},
		GenerationConfig: map[string]any{
			"temperature":     temperature,
			"maxOutputTokens": 8192,
		},
	}

	var lastErr error
	for attempt := 0; attempt <= c.Retries; attempt++ {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				return "", ctx.Err()
			case <-time.After(time.Duration(attempt) * 500 * time.Millisecond):
			}
		}
		out, err := c.do(ctx, body)
		if err == nil {
			return out, nil
		}
		lastErr = err
	}
	return "", fmt.Errorf("gemini %s: %w", c.Model, lastErr)
}

func (c *GeminiClient) do(ctx context.Context, body geminiRequest) (string, error) {
	raw, err := json.Marshal(body)
	if err != nil {
		return "", err
	}
	url := fmt.Sprintf("%s/%s:generateContent?key=%s", c.baseURL, c.Model, c.APIKey)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(raw))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("gemini HTTP %d: %s", resp.StatusCode, truncate(string(data), 500))
	}

	var parsed geminiResponse
	if err := json.Unmarshal(data, &parsed); err != nil {
		return "", fmt.Errorf("gemini bad response: %v", err)
	}
	if len(parsed.Candidates) == 0 {
		return "", errors.New("gemini returned no candidates")
	}
	first := parsed.Candidates[0]
	var sb strings.Builder
	for _, p := range first.Content.Parts {
		sb.WriteString(p.Text)
	}
	if sb.Len() == 0 {
		return "", errors.New("gemini returned empty output")
	}
	return sb.String(), nil
}
