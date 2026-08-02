export const CREATE_SANDBOX_DESCRIPTION = `Use this tool to create a new local sandbox — an ephemeral, isolated working directory on the current machine that serves as your development environment for the current session. This sandbox provides a secure workspace where you can upload files, install dependencies, run commands, start development servers, and preview web apps. Each sandbox is uniquely identified and must be referenced for all subsequent operations (e.g., file generation, command execution, or URL access).

## When to Use This Tool

Use this tool **once per session** when:

1. You begin working on a new user request that requires code execution or file creation
2. No sandbox currently exists for the session
3. The user asks to start a new project, scaffold an application, or test code in a live environment
4. The user requests a fresh or reset environment

## Sandbox Capabilities

After creation, the sandbox allows you to:

- Upload and manage files via \`Generate Files\`
- Execute shell commands with \`Run Command\`
- Access running servers through URLs using \`Get Sandbox URL\`

Each sandbox is a directory under the operating system's temporary directory. It supports rapid iteration and testing without polluting the host project. It has access to the tools installed on the machine (e.g., pnpm, node, python). You cannot use \`sudo\` — commands run as the current user.

## Best Practices

- Create the sandbox at the beginning of the session or when the user initiates a coding task
- Track and reuse the sandbox ID throughout the session
- Do not create a second sandbox unless explicitly instructed
- If the user requests an environment reset, you may create a new sandbox **after confirming their intent`

export const RUN_COMMAND_DESCRIPTION = `Use this tool to run a command inside an existing sandbox. You can choose whether the command should block until completion or run in the background by setting the \`wait\` parameter:

- \`wait: true\` → Command runs and **must complete** before the response is returned.
- \`wait: false\` → Command starts in the background, and the response returns immediately with its \`commandId\`.

⚠️ Commands are stateless — each one runs as an independent process with **no memory** of previous commands. You CANNOT rely on \`cd\`, but other state like background processes from prior commands should be available.

## When to Use This Tool

Use Run Command when:

1. You need to install dependencies (e.g., \`pnpm install\`)
2. You want to run a build or test process (e.g., \`pnpm build\`, \`vite build\`)
3. You need to launch a development server or long-running process
4. You need to compile or execute code within the sandbox
5. You want to run a task in the background without blocking the session

## Sequencing Rules

- If two commands depend on each other, **set \`wait: true\` on the first** to ensure it finishes before starting the second
  - ✅ Good: Run \`pnpm install\` with \`wait: true\` → then run \`pnpm dev\`
  - ❌ Bad: Run both with \`wait: false\` and expect them to be sequential
- Do **not** issue multiple sequential commands in one call
  - ❌ \`cd src && node index.js\`
  - ✅ \`node src/index.js\`
- Do **not** assume directory state is preserved — use full relative paths

## Command Format

- Separate the base command from its arguments
  - ✅ \`{ command: "pnpm", args: ["install", "--verbose"], wait: true }\`
  - ❌ \`{ command: "pnpm install --verbose" }\`
- Avoid shell syntax like pipes, redirections, or \`&&\`. If unavoidable, ensure it works in a stateless, single-session execution

## When to Set \`wait\` to True

- The next step depends on the result of the command
- The command must finish before accessing its output
- Example: Installing dependencies before building, compiling before running tests

## When to Set \`wait\` to False

- The command is intended to stay running indefinitely (e.g., a dev server)
- The command has no impact on subsequent operations (e.g., printing logs)

## Other Rules

- When running \`pnpm dev\` in a Next.js or Vite project, HMR can handle updates so generally you don't need to kill the server process and start it again after changing files.
- NEVER use \`pnpm run dev -- -p 3000\` for Next.js. The \`--\` causes Next.js to interpret \`-p\` as a directory path, resulting in an error. Just use \`pnpm run dev\` (port 3000 is the default).
- Port 3000 may already be in use by the host environment, so prefer starting dev servers on other common ports (e.g., 3001, 5173, 8000) when possible.

## Examples

<example>
User: Install dependencies and then run the dev server  
Assistant:  
1. Run Command: \`{ command: "pnpm", args: ["install"], wait: true }\`  
2. Run Command: \`{ command: "pnpm", args: ["run", "dev"], wait: false }\`  
</example>

<example>
User: Build the app with Vite  
Assistant:  
Run Command: \`{ command: "vite", args: ["build"], wait: true }\`  
</example>

## Summary

Use Run Command to start shell commands in the sandbox, controlling execution flow with the \`wait\` flag. Commands are stateless and isolated — use relative paths, and only run long-lived processes with \`wait: false\`.`;

export const GENERATE_FILES_DESCRIPTION = `Use this tool to generate and upload code files into an existing sandbox. It leverages an LLM to create file contents based on the current conversation context and user intent, then writes them directly into the sandbox file system.

The generated files should be considered correct on first iteration and suitable for immediate use in the sandbox environment. This tool is essential for scaffolding applications, adding new features, writing configuration files, or fixing missing components.

All file paths must be relative to the sandbox root (e.g., \`src/index.ts\`, \`package.json\`, \`components/Button.tsx\`).

## When to Use This Tool

Use Generate Files when:

1. You need to create one or more new files as part of a feature, scaffold, or fix
2. The user requests code that implies file creation (e.g., new routes, APIs, components, services)
3. You need to bootstrap a new application structure inside a sandbox
4. You're completing a multi-step task that involves generating or updating source code
5. A prior command failed due to a missing file, and you need to supply it

## File Generation Guidelines

- Every file must be complete, valid, and runnable where applicable
- File contents must reflect the user's intent and the overall session context
- File paths must be well-structured and use consistent naming conventions
- Generated files should assume compatibility with other existing files in the sandbox

## Best Practices

- Avoid redundant file generation if the file already exists and is unchanged
- Use conventional file/folder structures for the tech stack in use
- If replacing an existing file, ensure the update fully satisfies the user's request

## Examples of When to Use This Tool

<example>
User: Add a \`NavBar.tsx\` component and include it in \`App.tsx\`
Assistant: I'll generate the \`NavBar.tsx\` file and update \`App.tsx\` to include it.
*Uses Generate Files to create:*
- \`components/NavBar.tsx\`
- Modified \`App.tsx\` with import and usage of \`NavBar\`
</example>

<example>
User: Let's scaffold a simple Express server with a \`/ping\` route.
Assistant: I'll generate the necessary files to start the Express app.
*Uses Generate Files to create:*
- \`package.json\` with Express as a dependency
- \`index.js\` with basic server and \`/ping\` route
</example>

## When NOT to Use This Tool

Avoid using this tool when:

1. You only need to execute code or install packages (use Run Command instead)
2. You're waiting for a command to finish (use Wait Command)
3. You want to preview a running server or UI (use Get Sandbox URL)
4. You haven't created a sandbox yet (use Create Sandbox first)

## Output Behavior

After generation, the tool will return a list of the files created, including their paths and contents. These can then be inspected, referenced, or used in subsequent commands.

## Summary

Use Generate Files to programmatically create or update files in your sandbox. It enables fast iteration, contextual coding, and dynamic file management — all driven by user intent and conversation context.`;

export const GET_SANDBOX_URL_DESCRIPTION = `Use this tool to retrieve a URL for a specific port where a service is running inside the sandbox. This allows users (and the assistant) to preview web applications, access APIs, or interact with services running inside the sandbox via HTTP.

## When to Use This Tool

Use Get Sandbox URL when:

1. A service or web server is running on a port
2. You need to share a live preview link with the user
3. You want to access a running server inside the sandbox via HTTP
4. You need to programmatically test or call an internal endpoint running in the sandbox

## Critical Requirements

- The command serving on that port must be actively running
- Use \`Run Command\` followed by \`Wait Command\` (if needed) to start the server

## Best Practices

- Only call this tool after the server process has successfully started
- Use typical ports based on framework defaults (e.g., 3000 for Next.js, 5173 for Vite, 8000 for Python servers)
- If multiple services run on different ports, call this tool once per port

## When NOT to Use This Tool

Avoid using this tool when:

1. No server is running on the specified port
2. You haven't started the service yet or haven't waited for it to boot up
3. You are referencing a transient script or CLI command (not a persistent server)

## Example

<example>
User: Can I preview the app after it's built?
Assistant:
1. Create Sandbox
2. Generate Files: scaffold the app
3. Run Command: \`npm run dev\`
4. (Optional) Wait Command
5. Get Sandbox URL: port 3000
→ Returns: a URL the user can open in a browser
</example>

## Summary

Use Get Sandbox URL to access live previews of services running inside the sandbox.`;
