package rlm

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// Skill is one EVE skill bundle's SKILL.md (Contract 2 library).
type Skill struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Content     string `json:"content"`
	Path        string `json:"path"`
}

// SkillPlanConfig bounds a skillplan run.
type SkillPlanConfig struct {
	Model       string        // depth-1 model, default gemini-2.5-flash
	MaxWorkers  int           // default 5
	Mode        string        // sequence | parallel (default sequence)
	CallTimeout time.Duration // default 120s per application
}

// LoadSkills recursively discovers */SKILL.md bundles under dir. Every skill
// is loaded fully — the whole SKILL.md body is eligible for selection.
func LoadSkills(dir string) ([]Skill, error) {
	var skills []Skill
	err := filepath.WalkDir(dir, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() || d.Name() != "SKILL.md" {
			return nil
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		text := string(data)
		name := ""
		if i := strings.Index(text, "name:"); i != -1 {
			name = strings.TrimSpace(strings.SplitN(text[i+5:], "\n", 2)[0])
		}
		if name == "" {
			// EVE bundles name themselves via an H1 (e.g. "# eve").
			for _, line := range strings.Split(text, "\n") {
				if h := strings.TrimPrefix(line, "# "); len(h) < len(line) {
					name = strings.TrimSpace(h)
					break
				}
			}
		}
		desc := ""
		if i := strings.Index(text, "description:"); i != -1 {
			desc = strings.TrimSpace(strings.SplitN(text[i+12:], "\n", 2)[0])
		}
		skills = append(skills, Skill{
			Name:        name,
			Description: desc,
			Content:     text,
			Path:        path,
		})
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("load skills from %s: %w", dir, err)
	}
	sort.Slice(skills, func(i, j int) bool { return skills[i].Name < skills[j].Name })
	return skills, nil
}

// SelectSkills scores every skill against the task with a deterministic
// lexical scorer (name×3, description×2, body×1 token overlap) and returns
// the top-k in descending score order.
func SelectSkills(skills []Skill, task string, k int) []Skill {
	if k <= 0 {
		k = 3
	}
	type scored struct {
		skill Skill
		score int
	}
	needles := tokenize(task)
	all := make([]scored, 0, len(skills))
	for _, s := range skills {
		score := 0
		for _, tok := range needles {
			if strings.Contains(strings.ToLower(s.Name), tok) {
				score += 3
			}
			if strings.Contains(strings.ToLower(s.Description), tok) {
				score += 2
			}
			if strings.Contains(strings.ToLower(s.Content), tok) {
				score += 1
			}
		}
		all = append(all, scored{s, score})
	}
	sort.Slice(all, func(i, j int) bool {
		if all[i].score != all[j].score {
			return all[i].score > all[j].score
		}
		return all[i].skill.Name < all[j].skill.Name
	})
	if len(all) > k {
		all = all[:k]
	}
	out := make([]Skill, 0, len(all))
	for _, s := range all {
		out = append(out, s.skill)
	}
	return out
}

// ApplySkills runs each selected skill as a real depth-1 LLM call, asking the
// model to apply the skill's workflow to the task. Mode "sequence" runs calls
// one after another; any other mode runs them in parallel.
func ApplySkills(ctx context.Context, skills []Skill, task, mode string, cfg SkillPlanConfig) ([]Application, error) {
	if cfg.Model == "" {
		cfg.Model = "gemini-2.5-flash"
	}
	if cfg.MaxWorkers <= 0 {
		cfg.MaxWorkers = 5
	}
	if cfg.CallTimeout <= 0 {
		cfg.CallTimeout = 120 * time.Second
	}
	client, err := NewGeminiClient(cfg.Model)
	if err != nil {
		return nil, err
	}

	apps := make([]Application, len(skills))
	runOne := func(i int) {
		prompt := fmt.Sprintf(`Apply the following skill to the task below. Follow the skill's instructions exactly and return a concrete, self-contained result.

TASK:
%s

SKILL: %s
DESCRIPTION: %s

SKILL CONTENT:
%s

Final answer:`, task, skills[i].Name, skills[i].Description, truncate(skills[i].Content, 30000))

		callCtx, cancel := context.WithTimeout(ctx, cfg.CallTimeout)
		defer cancel()
		out, err := client.Generate(callCtx, prompt, "", 0.2)
		if err != nil {
			apps[i] = Application{Skill: skills[i].Name, Output: "[skill application error] " + err.Error()}
			return
		}
		apps[i] = Application{Skill: skills[i].Name, Output: out}
	}

	if mode != "sequence" && len(skills) > 1 {
		workers := cfg.MaxWorkers
		if workers > len(skills) {
			workers = len(skills)
		}
		sem := make(chan struct{}, workers)
		done := make(chan int, len(skills))
		for i := range skills {
			go func(i int) {
				sem <- struct{}{}
				defer func() { <-sem; done <- i }()
				runOne(i)
			}(i)
		}
		for range skills {
			<-done
		}
	} else {
		for i := range skills {
			if ctx.Err() != nil {
				apps[i] = Application{Skill: skills[i].Name, Output: "[skill application skipped: context canceled]"}
				continue
			}
			runOne(i)
		}
	}
	return apps, nil
}
