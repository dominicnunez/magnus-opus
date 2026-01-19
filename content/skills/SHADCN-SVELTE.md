# shadcn-svelte Best Practices

**Version:** 1.0.0
**Purpose:** UI component patterns with shadcn-svelte for Svelte 5
**Status:** Production Ready

## Overview

shadcn-svelte provides beautifully designed, accessible components built on Bits UI primitives. Components are copied into your project (not installed as dependencies), giving you full control over styling and behavior.

**Key characteristics:**
- Copy/paste components (not npm packages)
- Built on Bits UI primitives
- Tailwind CSS styling
- Full TypeScript support
- Accessible by default

## Installation & Setup

### Initialize shadcn-svelte

```bash
npx shadcn-svelte@latest init
```

Configuration prompts:
- Style: Default or New York
- Base color: Slate, Gray, Zinc, Neutral, Stone
- CSS variables: Yes (recommended)
- Location: `src/lib/components/ui`

### Add Components

```bash
# Add individual components
npx shadcn-svelte@latest add button
npx shadcn-svelte@latest add card
npx shadcn-svelte@latest add dialog
npx shadcn-svelte@latest add form

# Add multiple at once
npx shadcn-svelte@latest add button card input label
```

### Project Structure

```
src/lib/
├── components/
│   └── ui/
│       ├── button/
│       │   └── index.ts
│       ├── card/
│       │   └── index.ts
│       └── ...
└── utils.ts          # cn() utility
```

## Core Components

### Button

```svelte
<script lang="ts">
  import { Button } from "$lib/components/ui/button";
</script>

<!-- Variants -->
<Button>Default</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="destructive">Destructive</Button>
<Button variant="outline">Outline</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="link">Link</Button>

<!-- Sizes -->
<Button size="sm">Small</Button>
<Button size="default">Default</Button>
<Button size="lg">Large</Button>
<Button size="icon"><IconPlus /></Button>

<!-- With loading state -->
<script lang="ts">
  let loading = $state(false);
  
  async function handleClick() {
    loading = true;
    await doSomething();
    loading = false;
  }
</script>

<Button disabled={loading} onclick={handleClick}>
  {#if loading}
    <Loader2 class="mr-2 h-4 w-4 animate-spin" />
  {/if}
  Save Changes
</Button>
```

### Card

```svelte
<script lang="ts">
  import * as Card from "$lib/components/ui/card";
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>Card Title</Card.Title>
    <Card.Description>Card description goes here.</Card.Description>
  </Card.Header>
  <Card.Content>
    <p>Main content area</p>
  </Card.Content>
  <Card.Footer>
    <Button>Action</Button>
  </Card.Footer>
</Card.Root>
```

### Dialog

```svelte
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  
  let open = $state(false);
</script>

<Dialog.Root bind:open>
  <Dialog.Trigger asChild let:builder>
    <Button builders={[builder]}>Open Dialog</Button>
  </Dialog.Trigger>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>Dialog Title</Dialog.Title>
      <Dialog.Description>
        This is a description of what the dialog does.
      </Dialog.Description>
    </Dialog.Header>
    
    <div class="py-4">
      <!-- Dialog body content -->
    </div>
    
    <Dialog.Footer>
      <Button variant="outline" onclick={() => open = false}>
        Cancel
      </Button>
      <Button onclick={handleConfirm}>Confirm</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
```

### Input & Label

```svelte
<script lang="ts">
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  
  let email = $state("");
</script>

<div class="grid w-full max-w-sm gap-1.5">
  <Label for="email">Email</Label>
  <Input 
    type="email" 
    id="email" 
    placeholder="name@example.com"
    bind:value={email}
  />
</div>
```

### Select

```svelte
<script lang="ts">
  import * as Select from "$lib/components/ui/select";
  
  let selected = $state<string | undefined>(undefined);
</script>

<Select.Root bind:selected>
  <Select.Trigger class="w-[180px]">
    <Select.Value placeholder="Select option" />
  </Select.Trigger>
  <Select.Content>
    <Select.Group>
      <Select.Label>Fruits</Select.Label>
      <Select.Item value="apple">Apple</Select.Item>
      <Select.Item value="banana">Banana</Select.Item>
      <Select.Item value="orange">Orange</Select.Item>
    </Select.Group>
  </Select.Content>
</Select.Root>
```

### Tabs

```svelte
<script lang="ts">
  import * as Tabs from "$lib/components/ui/tabs";
</script>

<Tabs.Root value="account" class="w-[400px]">
  <Tabs.List>
    <Tabs.Trigger value="account">Account</Tabs.Trigger>
    <Tabs.Trigger value="password">Password</Tabs.Trigger>
  </Tabs.List>
  <Tabs.Content value="account">
    <p>Account settings content</p>
  </Tabs.Content>
  <Tabs.Content value="password">
    <p>Password settings content</p>
  </Tabs.Content>
</Tabs.Root>
```

## Form Patterns

### With Superforms + Zod

```svelte
<!-- +page.server.ts -->
<script lang="ts" context="module">
  import { z } from "zod";
  
  export const schema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Invalid email address"),
    role: z.enum(["admin", "user", "guest"]),
  });
  
  export type FormSchema = z.infer<typeof schema>;
</script>
```

```typescript
// +page.server.ts
import { superValidate } from "sveltekit-superforms";
import { zod } from "sveltekit-superforms/adapters";
import { schema } from "./schema";
import { fail } from "@sveltejs/kit";

export const load = async () => {
  const form = await superValidate(zod(schema));
  return { form };
};

export const actions = {
  default: async ({ request }) => {
    const form = await superValidate(request, zod(schema));
    
    if (!form.valid) {
      return fail(400, { form });
    }
    
    // Process form data
    await saveUser(form.data);
    
    return { form };
  },
};
```

```svelte
<!-- +page.svelte -->
<script lang="ts">
  import { superForm } from "sveltekit-superforms";
  import * as Form from "$lib/components/ui/form";
  import { Input } from "$lib/components/ui/input";
  import * as Select from "$lib/components/ui/select";
  import { Button } from "$lib/components/ui/button";
  
  let { data } = $props();
  
  const form = superForm(data.form);
  const { form: formData, enhance, errors, submitting } = form;
</script>

<form method="POST" use:enhance>
  <Form.Field {form} name="name">
    <Form.Control let:attrs>
      <Form.Label>Name</Form.Label>
      <Input {...attrs} bind:value={$formData.name} />
    </Form.Control>
    <Form.FieldErrors />
  </Form.Field>
  
  <Form.Field {form} name="email">
    <Form.Control let:attrs>
      <Form.Label>Email</Form.Label>
      <Input {...attrs} type="email" bind:value={$formData.email} />
    </Form.Control>
    <Form.FieldErrors />
  </Form.Field>
  
  <Form.Field {form} name="role">
    <Form.Control let:attrs>
      <Form.Label>Role</Form.Label>
      <Select.Root bind:selected={$formData.role}>
        <Select.Trigger {...attrs}>
          <Select.Value placeholder="Select a role" />
        </Select.Trigger>
        <Select.Content>
          <Select.Item value="admin">Admin</Select.Item>
          <Select.Item value="user">User</Select.Item>
          <Select.Item value="guest">Guest</Select.Item>
        </Select.Content>
      </Select.Root>
    </Form.Control>
    <Form.FieldErrors />
  </Form.Field>
  
  <Button type="submit" disabled={$submitting}>
    {$submitting ? "Saving..." : "Save"}
  </Button>
</form>
```

### Inline Validation

```svelte
<script lang="ts">
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  
  let email = $state("");
  let touched = $state(false);
  
  let error = $derived(() => {
    if (!touched) return null;
    if (!email) return "Email is required";
    if (!email.includes("@")) return "Invalid email";
    return null;
  });
</script>

<div class="space-y-2">
  <Label for="email">Email</Label>
  <Input
    id="email"
    type="email"
    bind:value={email}
    onblur={() => touched = true}
    class={error ? "border-destructive" : ""}
  />
  {#if error}
    <p class="text-sm text-destructive">{error}</p>
  {/if}
</div>
```

## Theming & Dark Mode

### CSS Variables Setup

```css
/* app.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 212.7 26.8% 83.9%;
  }
}
```

### Dark Mode Toggle

```svelte
<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import Sun from "lucide-svelte/icons/sun";
  import Moon from "lucide-svelte/icons/moon";
  import { onMount } from "svelte";
  
  let theme = $state<"light" | "dark">("light");
  
  onMount(() => {
    theme = document.documentElement.classList.contains("dark") 
      ? "dark" 
      : "light";
  });
  
  function toggleTheme() {
    theme = theme === "light" ? "dark" : "light";
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("theme", theme);
  }
</script>

<Button variant="ghost" size="icon" onclick={toggleTheme}>
  {#if theme === "light"}
    <Sun class="h-5 w-5" />
  {:else}
    <Moon class="h-5 w-5" />
  {/if}
  <span class="sr-only">Toggle theme</span>
</Button>
```

### Initialize Theme (in app.html)

```html
<script>
  const theme = localStorage.getItem("theme") ?? 
    (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  document.documentElement.classList.toggle("dark", theme === "dark");
</script>
```

## Accessibility

### Keyboard Navigation

All shadcn-svelte components support keyboard navigation by default:

| Component | Keys |
|-----------|------|
| Dialog | `Escape` to close |
| Select | `Arrow Up/Down` to navigate, `Enter` to select |
| Tabs | `Arrow Left/Right` to switch, `Enter` to activate |
| Menu | `Arrow Up/Down` to navigate, `Escape` to close |

### Screen Reader Support

```svelte
<!-- Always provide descriptive labels -->
<Dialog.Root>
  <Dialog.Content>
    <Dialog.Title>Delete Item</Dialog.Title>
    <Dialog.Description>
      Are you sure you want to delete this item? This action cannot be undone.
    </Dialog.Description>
    <!-- ... -->
  </Dialog.Content>
</Dialog.Root>

<!-- Use sr-only for icon-only buttons -->
<Button variant="ghost" size="icon">
  <Trash class="h-4 w-4" />
  <span class="sr-only">Delete item</span>
</Button>

<!-- Announce loading states -->
<Button disabled={loading} aria-busy={loading}>
  {loading ? "Saving..." : "Save"}
</Button>
```

### Focus Management

```svelte
<script lang="ts">
  import { Input } from "$lib/components/ui/input";
  
  let inputRef: HTMLInputElement;
  
  function focusInput() {
    inputRef?.focus();
  }
</script>

<Input bind:this={inputRef} />
<Button onclick={focusInput}>Focus Input</Button>
```

## Common Patterns

### Data Table with Sorting

```svelte
<script lang="ts">
  import * as Table from "$lib/components/ui/table";
  import { Button } from "$lib/components/ui/button";
  import ArrowUpDown from "lucide-svelte/icons/arrow-up-down";
  
  type User = { id: string; name: string; email: string; role: string };
  
  let { users }: { users: User[] } = $props();
  
  let sortKey = $state<keyof User>("name");
  let sortDir = $state<"asc" | "desc">("asc");
  
  let sorted = $derived(
    [...users].sort((a, b) => {
      const cmp = a[sortKey].localeCompare(b[sortKey]);
      return sortDir === "asc" ? cmp : -cmp;
    })
  );
  
  function toggleSort(key: keyof User) {
    if (sortKey === key) {
      sortDir = sortDir === "asc" ? "desc" : "asc";
    } else {
      sortKey = key;
      sortDir = "asc";
    }
  }
</script>

<Table.Root>
  <Table.Header>
    <Table.Row>
      <Table.Head>
        <Button variant="ghost" onclick={() => toggleSort("name")}>
          Name <ArrowUpDown class="ml-2 h-4 w-4" />
        </Button>
      </Table.Head>
      <Table.Head>Email</Table.Head>
      <Table.Head>Role</Table.Head>
    </Table.Row>
  </Table.Header>
  <Table.Body>
    {#each sorted as user (user.id)}
      <Table.Row>
        <Table.Cell>{user.name}</Table.Cell>
        <Table.Cell>{user.email}</Table.Cell>
        <Table.Cell>{user.role}</Table.Cell>
      </Table.Row>
    {/each}
  </Table.Body>
</Table.Root>
```

### Command Palette

```svelte
<script lang="ts">
  import * as Command from "$lib/components/ui/command";
  import * as Dialog from "$lib/components/ui/dialog";
  import { onMount } from "svelte";
  
  let open = $state(false);
  
  onMount(() => {
    function handleKeydown(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        open = !open;
      }
    }
    
    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  });
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="p-0">
    <Command.Root>
      <Command.Input placeholder="Type a command or search..." />
      <Command.List>
        <Command.Empty>No results found.</Command.Empty>
        <Command.Group heading="Pages">
          <Command.Item onSelect={() => goto("/dashboard")}>
            Dashboard
          </Command.Item>
          <Command.Item onSelect={() => goto("/settings")}>
            Settings
          </Command.Item>
        </Command.Group>
        <Command.Group heading="Actions">
          <Command.Item onSelect={createNew}>
            Create New...
          </Command.Item>
        </Command.Group>
      </Command.List>
    </Command.Root>
  </Dialog.Content>
</Dialog.Root>
```

### Toast Notifications

```svelte
<!-- Setup in +layout.svelte -->
<script lang="ts">
  import { Toaster } from "$lib/components/ui/sonner";
</script>

<slot />
<Toaster />
```

```svelte
<!-- Usage anywhere -->
<script lang="ts">
  import { toast } from "svelte-sonner";
  import { Button } from "$lib/components/ui/button";
  
  function showToast() {
    toast.success("Changes saved successfully");
  }
  
  function showError() {
    toast.error("Failed to save changes", {
      description: "Please try again later",
      action: {
        label: "Retry",
        onClick: () => retry(),
      },
    });
  }
</script>

<Button onclick={showToast}>Save</Button>
```

## Best Practices

**Do:**
- Use semantic component composition (`Card.Header`, `Card.Content`, etc.)
- Provide `Dialog.Title` and `Dialog.Description` for accessibility
- Use `sr-only` class for icon-only button labels
- Leverage CSS variables for consistent theming
- Use `$derived` for computed UI state
- Handle loading and disabled states explicitly

**Don't:**
- Override component internals without understanding Bits UI primitives
- Skip form validation feedback
- Forget keyboard navigation testing
- Use color alone to convey information
- Hardcode colors instead of CSS variables
- Create deeply nested component hierarchies

## Summary

shadcn-svelte provides:
1. **Beautiful defaults** - Production-ready styling out of the box
2. **Full control** - Components live in your codebase
3. **Accessibility** - Built on Bits UI with ARIA support
4. **Flexibility** - Easy to customize with Tailwind
5. **Type safety** - Full TypeScript support with Svelte 5
