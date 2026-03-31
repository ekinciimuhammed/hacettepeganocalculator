g, '$1').replace(/__(.*?)__/g, '$1');
                }
                
                if (cleanLine.includes('*') || cleanLine.includes('_')) {
                    cleanLine = cleanLine.replace(/\*(.*?)\*/g, '$1').replace(/_(.*?)_/g, '$1');
                }
                
                // Handle code blocks (monospace simulation)
                if (cleanLine.includes('`')) {
                    cleanLine = cleanLine.replace(/`(.*?)`/g, '$1');
                }
                
                // Draw the text
                try {
                    currentPage.drawText(cleanLine, {
                        x: margin,
                        y: y,
                        size: currentFontSize,
                        maxWidth: maxWidth,
                        lineHeight: lineHeight
                    });
                } catch (error) {
                    // Fallback for problematic characters
                    const safeText = cleanLine.replace(/[^\x00-\x7F]/g, '?');
                    currentPage.drawText(safeText, {
                        x: margin,
                        y: y,
                        size: currentFontSize,
                        maxWidth: maxWidth,
                        lineHeight: lineHeight
                    });
                }
            }
            
            y -= lineHeight;
        }
    },
    // Convert HTML to formatted text with better structure preservation

    convertHtmlToFormattedText(htmlContent) {
        return htmlContent
            // Headers
            .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '\n\n# $1\n')
            .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '\n\n## $1\n')
            .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '\n\n### $1\n')
            .replace(/<h4[^>]*>(.*?)<\/h4>/gi, '\n\n#### $1\n')
            .replace(/<h5[^>]*>(.*?)<\/h5>/gi, '\n\n##### $1\n')
            .replace(/<h6[^>]*>(.*?)<\/h6>/gi, '\n\n###### $1\n')
            // Paragraphs
            .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
            // Line breaks
            .replace(/<br\s*\/?>/gi, '\n')
            // Lists
            .replace(/<ul[^>]*>/gi, '\n')
            .replace(/<\/ul>/gi, '\n')
            .replace(/<ol[^>]*>/gi, '\n')
            .replace(/<\/ol>/gi, '\n')
            .replace(/<li[^>]*>(.*?)<\/li>/gi, '• $1\n')
            // Blockquotes
            .replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, '\n> $1\n')
            // Code blocks
            .replace(/<pre[^>]*><code[^>]*>(.*?)<\/code><\/pre>/gi, '\n```\n$1\n```\n')
            .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
            // Tables (basic)
            .replace(/<table[^>]*>/gi, '\n')
            .replace(/<\/table>/gi, '\n')
            .replace(/<tr[^>]*>/gi, '')
            .replace(/<\/tr>/gi, '\n')
            .replace(/<th[^>]*>(.*?)<\/th>/gi, '| $1 ')
            .replace(/<td[^>]*>(.*?)<\/td>/gi, '| $1 ')
            // Horizontal rules
            .replace(/<hr[^>]*>/gi, '\n---\n')
            // Strong and emphasis
            .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
            .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
            .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
            .replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*')
            // Links
            .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '$2 ($1)')
            // Remove remaining HTML tags
            .replace(/<[^>]*>/g, '')
            // Clean up HTML entities
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            // Clean up extra whitespace
            .replace(/\n\s*\n\s*\n/g, '\n\n')
            .trim();
    }
});
