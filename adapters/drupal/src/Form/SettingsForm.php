<?php

namespace Drupal\openfeeder\Form;

use Drupal\Core\Form\ConfigFormBase;
use Drupal\Core\Form\FormStateInterface;

/**
 * Configuration form for OpenFeeder settings.
 */
class SettingsForm extends ConfigFormBase {

  /**
   * {@inheritdoc}
   */
  protected function getEditableConfigNames(): array {
    return ['openfeeder.settings'];
  }

  /**
   * {@inheritdoc}
   */
  public function getFormId(): string {
    return 'openfeeder_settings_form';
  }

  /**
   * {@inheritdoc}
   */
  public function buildForm(array $form, FormStateInterface $form_state): array {
    $config = $this->config('openfeeder.settings');

    $form['enabled'] = [
      '#type' => 'checkbox',
      '#title' => $this->t('Enable OpenFeeder'),
      '#description' => $this->t('Expose published content via the OpenFeeder protocol.'),
      '#default_value' => $config->get('enabled') ?? TRUE,
    ];

    $form['description'] = [
      '#type' => 'textfield',
      '#title' => $this->t('Site Description'),
      '#description' => $this->t('Overrides the site slogan in the discovery document. Leave blank to use the site slogan.'),
      '#default_value' => $config->get('description') ?? '',
      '#maxlength' => 255,
    ];

    $form['max_chunks'] = [
      '#type' => 'number',
      '#title' => $this->t('Max Chunks per Response'),
      '#description' => $this->t('Maximum number of chunks returned in a single API response (1-50).'),
      '#default_value' => $config->get('max_chunks') ?? 50,
      '#min' => 1,
      '#max' => 50,
    ];

    $form['api_key'] = [
      '#type' => 'textfield',
      '#title' => $this->t('API Key'),
      '#description' => $this->t('Optional. If set, requests to /openfeeder must include an Authorization: Bearer &lt;key&gt; header. Leave blank to allow public access. The discovery endpoint is always public.'),
      '#default_value' => $config->get('api_key') ?? '',
      '#maxlength' => 255,
    ];

    $form['security'] = [
      '#type' => 'details',
      '#title' => $this->t('Security'),
      '#open' => TRUE,
    ];

    $form['security']['excluded_paths'] = [
      '#type' => 'textarea',
      '#title' => $this->t('Excluded Paths'),
      '#description' => $this->t('Path prefixes to exclude from OpenFeeder (one per line). Nodes with URLs starting with these prefixes will not be exposed.'),
      '#default_value' => implode("\n", $config->get('excluded_paths') ?? []),
      '#rows' => 5,
    ];

    $form['security']['excluded_content_types'] = [
      '#type' => 'textarea',
      '#title' => $this->t('Excluded Content Types'),
      '#description' => $this->t('Machine names of content types to exclude (one per line).'),
      '#default_value' => implode("\n", $config->get('excluded_content_types') ?? []),
      '#rows' => 3,
    ];

    $form['security']['author_display'] = [
      '#type' => 'select',
      '#title' => $this->t('Author Display'),
      '#description' => $this->t('Control whether author names appear in OpenFeeder responses. Only display names are ever used — email addresses and user IDs are never exposed.'),
      '#options' => [
        'name' => $this->t('Display name only'),
        'hidden' => $this->t('Hidden (never expose author)'),
      ],
      '#default_value' => $config->get('author_display') ?? 'name',
    ];

    return parent::buildForm($form, $form_state);
  }

  /**
   * {@inheritdoc}
   */
  public function submitForm(array &$form, FormStateInterface $form_state): void {
    $excluded_paths = array_filter(
      array_map('trim', explode("\n", $form_state->getValue('excluded_paths') ?? '')),
      fn($v) => $v !== ''
    );
    $excluded_types = array_filter(
      array_map('trim', explode("\n", $form_state->getValue('excluded_content_types') ?? '')),
      fn($v) => $v !== ''
    );

    $this->config('openfeeder.settings')
      ->set('enabled', (bool) $form_state->getValue('enabled'))
      ->set('description', $form_state->getValue('description'))
      ->set('max_chunks', (int) $form_state->getValue('max_chunks'))
      ->set('api_key', $form_state->getValue('api_key'))
      ->set('excluded_paths', array_values($excluded_paths))
      ->set('excluded_content_types', array_values($excluded_types))
      ->set('author_display', $form_state->getValue('author_display'))
      ->save();

    parent::submitForm($form, $form_state);
  }

}
