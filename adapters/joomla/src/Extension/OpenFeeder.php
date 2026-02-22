<?php

/**
 * @package     Joomla.Plugin
 * @subpackage  System.OpenFeeder
 *
 * @copyright   OpenFeeder
 * @license     GNU General Public License version 2 or later
 */

namespace Joomla\Plugin\System\OpenFeeder\Extension;

defined('_JEXEC') or die;

use Joomla\CMS\Plugin\CMSPlugin;
use Joomla\Event\SubscriberInterface;
use Joomla\Plugin\System\OpenFeeder\Controller\ContentController;
use Joomla\Plugin\System\OpenFeeder\Controller\DiscoveryController;

class OpenFeeder extends CMSPlugin implements SubscriberInterface
{
    protected $autoloadLanguage = true;

    public static function getSubscribedEvents(): array
    {
        return [
            'onAfterRoute'        => 'onAfterRoute',
            'onContentAfterSave'  => 'onContentAfterSave',
        ];
    }

    public function onAfterRoute(): void
    {
        $app = $this->getApplication();

        if (!$app->isClient('site')) {
            return;
        }

        if (!(int) $this->params->get('enabled', 1)) {
            return;
        }

        $uri  = \Joomla\CMS\Uri\Uri::getInstance();
        $path = rtrim($uri->getPath(), '/');
        $base = rtrim(\Joomla\CMS\Uri\Uri::base(true), '/');

        // Strip the base path so we compare only the route portion
        if ($base !== '' && strpos($path, $base) === 0) {
            $path = substr($path, strlen($base));
        }

        if ($path === '/.well-known/openfeeder.json') {
            $controller = new DiscoveryController($app, $this->params);
            $controller->execute();
        }

        if ($path === '/api/openfeeder') {
            $controller = new ContentController($app, $this->params);
            $controller->execute();
        }
    }

    public function onContentAfterSave(string $context, $article, bool $isNew): void
    {
        if ($context !== 'com_content.article' && $context !== 'com_content.form') {
            return;
        }

        $cache = \Joomla\CMS\Factory::getCache('openfeeder', '');
        $cache->clean();
    }
}
