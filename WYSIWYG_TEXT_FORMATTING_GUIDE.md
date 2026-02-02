# WYSIWYG Editor Text Formatting Guide

## How to Create Hanging Indents (Text That Wraps Under Itself)

### The Problem
When you have numbered text like:
```
2.1. The regatta will be governed by the rules...
```

You want the wrapped text to align under "The" (not under "2.1."), creating a "hanging indent" effect.

### The Solution: Use Custom HTML Classes

Since ReactQuill's indent buttons indent the entire paragraph (including numbers), you need to use custom CSS for hanging indents.

#### Method 1: Use Text Editor (Recommended for this use case)

1. **Type your content normally** with the numbering
2. **Select the paragraph** that needs hanging indent
3. **Use the toolbar's indent buttons** to create the visual spacing you want

The issue is that Quill's built-in indent will indent everything including the number. For true hanging indents, you'll need to either:

#### Method 2: Custom CSS Solution (If needed)

Add this CSS to your document or use a custom format:

```css
.hanging-indent {
  padding-left: 3em;
  text-indent: -3em;
}
```

Then apply it to paragraphs where the wrapped text should align under the content (not the number).

### Workaround for Current Editor

**Option A: Use Nested Lists**
1. Create a numbered list
2. For sub-items, create another numbered list (2.1, 2.2, etc.)
3. Quill will handle the indentation automatically

**Option B: Manual Spacing with Non-Breaking Spaces**
1. Type your number: `2.1.`
2. Add several non-breaking spaces (`&nbsp;`) to create the visual indent
3. Type your text
4. When text wraps, it will naturally align under where the text starts

**Option C: Use Tables (Advanced)**
1. Create a 2-column table with no borders
2. Put the number in the left column (narrow)
3. Put the text in the right column
4. Text will wrap within the right column

### Recommended Approach for Your Use Case

For legal/formal documents like Notice of Race:

1. **Use the built-in numbered list feature** for main sections (1, 2, 3...)
2. **For sub-sections** (2.1, 2.2, etc.), manually type the numbers
3. **Use the indent button once** to create visual separation
4. Accept that wrapped text will indent with the number (this is actually acceptable in most formal documents)

### Future Enhancement

If you need true hanging indents, we can add a custom toolbar button that:
1. Wraps selected text in a div with `class="hanging-indent"`
2. Applies the hanging indent CSS automatically
3. Gives you a toggle button to apply/remove this formatting

Let me know if you'd like this custom feature added!
