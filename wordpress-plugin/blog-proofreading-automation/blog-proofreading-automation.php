<?php
/**
 * Plugin Name: Blog Proofreading Automation
 * Description: Sync draft and scheduled posts to Google Sheets for proofreading.
 * Version: 0.2.0
 * Author: Codex
 */

if (!defined('ABSPATH')) {
    exit;
}

class Blog_Proofreading_Automation
{
    private const OPTION_WEBHOOK_URL = 'bpa_webhook_url';
    private const OPTION_SHARED_SECRET = 'bpa_shared_secret';
    private const META_LAST_SYNC_AT = '_bpa_last_sync_at';
    private const META_LAST_SYNC_STATUS = '_bpa_last_sync_status';
    private const META_LAST_SYNC_ERROR = '_bpa_last_sync_error';
    private const META_LOCK = '_bpa_sync_lock';
    private const CRON_HOOK = 'bpa_sync_post_to_sheet';

    public function __construct()
    {
        add_action('save_post', [$this, 'queue_sync'], 20, 3);
        add_action('transition_post_status', [$this, 'queue_sync_on_status_change'], 20, 3);
        add_action(self::CRON_HOOK, [$this, 'sync_post_to_sheet'], 10, 1);
        add_action('admin_menu', [$this, 'register_settings_page']);
        add_action('admin_init', [$this, 'register_settings']);
        add_action('add_meta_boxes', [$this, 'register_meta_box']);
    }

    public function queue_sync($post_id, $post, $update)
    {
        if (!$this->is_target_post($post_id, $post)) {
            return;
        }

        if (wp_is_post_revision($post_id) || (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE)) {
            return;
        }

        if (!$update && !in_array($post->post_status, ['draft', 'future'], true)) {
            return;
        }

        $this->schedule_job($post_id);
    }

    public function queue_sync_on_status_change($new_status, $old_status, $post)
    {
        if (!$post instanceof WP_Post) {
            return;
        }

        if (!$this->is_target_post($post->ID, $post)) {
            return;
        }

        if (in_array($new_status, ['draft', 'future'], true)) {
            $this->schedule_job($post->ID);
        }
    }

    public function sync_post_to_sheet($post_id)
    {
        $post = get_post($post_id);

        if (!$this->is_target_post($post_id, $post)) {
            return;
        }

        if (get_post_meta($post_id, self::META_LOCK, true)) {
            return;
        }

        update_post_meta($post_id, self::META_LOCK, time());

        try {
            $webhook_url = $this->get_webhook_url();
            if ($webhook_url === '') {
                throw new RuntimeException('Webhook URL is not configured.');
            }

            $payload = $this->build_payload($post);
            $response = wp_remote_post($webhook_url, [
                'timeout' => 20,
                'headers' => [
                    'Content-Type' => 'application/json',
                ],
                'body' => wp_json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            ]);

            if (is_wp_error($response)) {
                throw new RuntimeException($response->get_error_message());
            }

            $status_code = wp_remote_retrieve_response_code($response);
            $body = wp_remote_retrieve_body($response);

            if ($status_code < 200 || $status_code >= 300) {
                throw new RuntimeException('Webhook request failed: ' . $status_code . ' ' . $body);
            }

            $decoded = json_decode($body, true);
            $sync_status = is_array($decoded) && isset($decoded['status']) ? (string) $decoded['status'] : 'synced';

            update_post_meta($post_id, self::META_LAST_SYNC_AT, current_time('mysql'));
            update_post_meta($post_id, self::META_LAST_SYNC_STATUS, $sync_status);
            delete_post_meta($post_id, self::META_LAST_SYNC_ERROR);
        } catch (Throwable $e) {
            update_post_meta($post_id, self::META_LAST_SYNC_AT, current_time('mysql'));
            update_post_meta($post_id, self::META_LAST_SYNC_STATUS, 'error');
            update_post_meta($post_id, self::META_LAST_SYNC_ERROR, $e->getMessage());
        } finally {
            delete_post_meta($post_id, self::META_LOCK);
        }
    }

    public function register_settings_page()
    {
        add_options_page(
            'Blog Proofreading Automation',
            'Blog Proofreading',
            'manage_options',
            'blog-proofreading-automation',
            [$this, 'render_settings_page']
        );
    }

    public function register_settings()
    {
        register_setting('bpa_settings', self::OPTION_WEBHOOK_URL, [
            'type' => 'string',
            'sanitize_callback' => 'esc_url_raw',
            'default' => '',
        ]);

        register_setting('bpa_settings', self::OPTION_SHARED_SECRET, [
            'type' => 'string',
            'sanitize_callback' => 'sanitize_text_field',
            'default' => '',
        ]);

        add_settings_section(
            'bpa_main_section',
            'Google Sheets sync',
            function () {
                echo '<p>Draft and scheduled posts are pushed to your Google Sheet through an Apps Script webhook.</p>';
            },
            'blog-proofreading-automation'
        );

        add_settings_field(
            self::OPTION_WEBHOOK_URL,
            'Apps Script webhook URL',
            [$this, 'render_webhook_url_field'],
            'blog-proofreading-automation',
            'bpa_main_section'
        );

        add_settings_field(
            self::OPTION_SHARED_SECRET,
            'Shared secret',
            [$this, 'render_shared_secret_field'],
            'blog-proofreading-automation',
            'bpa_main_section'
        );
    }

    public function render_webhook_url_field()
    {
        $value = esc_attr($this->get_webhook_url());
        echo '<input type="url" name="' . esc_attr(self::OPTION_WEBHOOK_URL) . '" value="' . $value . '" class="regular-text" placeholder="https://script.google.com/macros/s/..." />';
    }

    public function render_shared_secret_field()
    {
        $value = esc_attr((string) get_option(self::OPTION_SHARED_SECRET, ''));
        echo '<input type="text" name="' . esc_attr(self::OPTION_SHARED_SECRET) . '" value="' . $value . '" class="regular-text" />';
        echo '<p class="description">Set the same secret in the Apps Script to reject unauthorized requests.</p>';
    }

    public function render_settings_page()
    {
        ?>
        <div class="wrap">
            <h1>Blog Proofreading Automation</h1>
            <form method="post" action="options.php">
                <?php
                settings_fields('bpa_settings');
                do_settings_sections('blog-proofreading-automation');
                submit_button('Save settings');
                ?>
            </form>
        </div>
        <?php
    }

    public function register_meta_box()
    {
        add_meta_box(
            'bpa-proofreading-sync-status',
            'Proofreading Sheet Sync',
            [$this, 'render_meta_box'],
            'post',
            'side',
            'high'
        );
    }

    public function render_meta_box($post)
    {
        $last_sync_at = (string) get_post_meta($post->ID, self::META_LAST_SYNC_AT, true);
        $last_sync_status = (string) get_post_meta($post->ID, self::META_LAST_SYNC_STATUS, true);
        $last_sync_error = (string) get_post_meta($post->ID, self::META_LAST_SYNC_ERROR, true);

        echo '<p><strong>Status:</strong> ' . esc_html($last_sync_status !== '' ? $last_sync_status : 'not synced') . '</p>';
        echo '<p><strong>Last sync:</strong> ' . esc_html($last_sync_at !== '' ? $last_sync_at : '-') . '</p>';

        if ($last_sync_error !== '') {
            echo '<p><strong>Error:</strong><br />' . esc_html($last_sync_error) . '</p>';
        }

        echo '<p>Draft and scheduled posts are automatically sent to the proofreading spreadsheet.</p>';
    }

    private function schedule_job($post_id)
    {
        if (!wp_next_scheduled(self::CRON_HOOK, [$post_id])) {
            wp_schedule_single_event(time() + 5, self::CRON_HOOK, [$post_id]);
        }
    }

    private function is_target_post($post_id, $post)
    {
        if (!$post instanceof WP_Post) {
            return false;
        }

        if ((int) $post_id <= 0 || $post->post_type !== 'post') {
            return false;
        }

        return in_array($post->post_status, ['draft', 'future'], true);
    }

    private function get_webhook_url()
    {
        return (string) get_option(self::OPTION_WEBHOOK_URL, '');
    }

    private function build_payload($post)
    {
        return [
            'secret' => (string) get_option(self::OPTION_SHARED_SECRET, ''),
            'post_id' => (int) $post->ID,
            'site_name' => get_bloginfo('name'),
            'site_url' => home_url('/'),
            'post_status' => (string) $post->post_status,
            'title' => (string) $post->post_title,
            'slug' => (string) $post->post_name,
            'excerpt' => (string) $post->post_excerpt,
            'content' => wp_strip_all_tags((string) $post->post_content),
            'preview_url' => get_preview_post_link($post),
            'edit_url' => get_edit_post_link($post->ID, ''),
            'author' => $this->get_author_name((int) $post->post_author),
            'categories' => $this->get_term_names($post->ID, 'category'),
            'tags' => $this->get_term_names($post->ID, 'post_tag'),
            'updated_at' => get_post_modified_time('c', true, $post),
        ];
    }

    private function get_author_name($author_id)
    {
        $user = get_user_by('id', $author_id);
        return $user instanceof WP_User ? (string) $user->display_name : '';
    }

    private function get_term_names($post_id, $taxonomy)
    {
        $terms = get_the_terms($post_id, $taxonomy);
        if (!is_array($terms)) {
            return [];
        }

        return array_values(array_map(static function ($term) {
            return (string) $term->name;
        }, $terms));
    }
}

new Blog_Proofreading_Automation();
